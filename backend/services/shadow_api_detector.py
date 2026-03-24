"""
Shadow API Detection Service

Detects undocumented/shadow API endpoints through:
- Pattern matching against documented endpoints
- Behavioral analysis of request/response patterns
- Risk assessment of suspicious endpoints
- Compliance requirement linking
- Recommendations for remediation
"""

import re
import json
import hashlib
from typing import Optional, Dict, List, Tuple, Any
from dataclasses import dataclass, field, asdict
from enum import Enum
from datetime import datetime, timedelta
from statistics import mean, stdev
import asyncio
from collections import defaultdict

from .supabase_client import get_supabase_client


class ShadowAPIRiskLevel(str, Enum):
    """Risk level classification for shadow APIs"""
    LOW = "low"           # Minor deviation, documented-adjacent
    MEDIUM = "medium"     # Undocumented but low-risk functionality
    HIGH = "high"         # Undocumented with data-sensitive operations
    CRITICAL = "critical" # Unauthorized, compliance-violating, exposed admin


class BehaviorAnomalyType(str, Enum):
    """Types of behavioral anomalies detected"""
    UNAUTHORIZED_METHOD = "unauthorized_method"  # Unusual HTTP method
    UNUSUAL_PARAMETER = "unusual_parameter"      # Non-standard query params
    LARGE_PAYLOAD = "large_payload"             # Unusually large request
    DATA_EXPOSURE = "data_exposure"             # Sensitive data in response
    RAPID_REQUESTS = "rapid_requests"           # Suspicious rate pattern
    ELEVATED_PRIVILEGE = "elevated_privilege"   # Direct resource access
    PATTERN_MISMATCH = "pattern_mismatch"       # Doesn't match API style


@dataclass
class EndpointPattern:
    """Documented API endpoint pattern"""
    path: str
    method: str
    description: str
    parameters: List[str] = field(default_factory=list)
    sensitive_data: bool = False
    auth_required: bool = True
    
    def to_dict(self) -> dict:
        return asdict(self)


@dataclass
class ShadowAPIDiscovery:
    """Information about detected shadow API"""
    endpoint_path: str
    http_method: str
    first_seen: datetime
    last_seen: datetime
    request_count: int
    unique_users: int
    avg_response_time_ms: float
    risk_level: ShadowAPIRiskLevel
    risk_score: float  # 0-100
    confidence: float  # 0-1
    anomaly_types: List[BehaviorAnomalyType] = field(default_factory=list)
    behavioral_patterns: Dict[str, Any] = field(default_factory=dict)
    affected_compliance: List[str] = field(default_factory=list)
    remediation_items: List[str] = field(default_factory=list)
    
    def to_dict(self) -> dict:
        data = asdict(self)
        data['risk_level'] = self.risk_level.value
        data['anomaly_types'] = [a.value for a in self.anomaly_types]
        data['first_seen'] = self.first_seen.isoformat()
        data['last_seen'] = self.last_seen.isoformat()
        return data


@dataclass
class BehaviorAnalysis:
    """Behavioral analysis of endpoint usage"""
    endpoint_path: str
    http_method: str
    total_requests: int
    unique_sources: int
    avg_payload_size: float
    max_payload_size: int
    avg_response_time_ms: float
    max_response_time_ms: int
    status_code_distribution: Dict[int, int] = field(default_factory=dict)
    parameter_patterns: Dict[str, int] = field(default_factory=dict)
    temporal_patterns: Dict[str, int] = field(default_factory=dict)
    average_requests_per_hour: float = 0.0
    peak_hour_requests: int = 0
    is_periodic: bool = False
    detected_anomalies: List[str] = field(default_factory=list)


class ShadowAPIDetector:
    """
    Main shadow API detection engine
    
    Detects undocumented endpoints through pattern matching,
    behavioral analysis, and risk assessment.
    """
    
    def __init__(self):
        self.client = get_supabase_client()
        self.documented_endpoints: List[EndpointPattern] = []
        self.shadow_apis_cache: Dict[str, ShadowAPIDiscovery] = {}
        self.pattern_regexes: Dict[str, re.Pattern] = {}
    
    async def initialize(self):
        """Initialize detector with documented endpoints"""
        await self._load_documented_endpoints()
        self._build_pattern_regexes()
    
    async def _load_documented_endpoints(self):
        """Load documented endpoints from database"""
        try:
            response = self.client.table("endpoints").select("*").execute()
            endpoints = response.data or []
            
            self.documented_endpoints = [
                EndpointPattern(
                    path=ep.get("path"),
                    method=ep.get("method", "GET"),
                    description=ep.get("description", ""),
                    parameters=ep.get("parameters", []),
                    sensitive_data=ep.get("sensitive_data", False),
                    auth_required=ep.get("auth_required", True)
                )
                for ep in endpoints
            ]
        except Exception as e:
            print(f"Error loading documented endpoints: {e}")
            self.documented_endpoints = []
    
    def _build_pattern_regexes(self):
        """Build regex patterns from documented endpoints for matching"""
        for ep in self.documented_endpoints:
            # Convert path to regex pattern
            # /api/users/:id/posts -> /api/users/[^/]+/posts
            pattern_str = ep.path
            pattern_str = re.sub(r':\w+', r'[^/]+', pattern_str)
            pattern_str = f"^{pattern_str}$"
            
            key = f"{ep.method}:{ep.path}"
            try:
                self.pattern_regexes[key] = re.compile(pattern_str)
            except Exception as e:
                print(f"Error compiling pattern for {key}: {e}")
    
    def _is_documented(self, endpoint_path: str, http_method: str) -> bool:
        """Check if endpoint is documented"""
        for ep in self.documented_endpoints:
            if ep.method == http_method:
                if ep.path == endpoint_path:
                    return True
                # Try regex match
                pattern_str = ep.path
                pattern_str = re.sub(r':\w+', r'[^/]+', pattern_str)
                pattern_str = f"^{pattern_str}$"
                if re.match(pattern_str, endpoint_path):
                    return True
        return False
    
    def _extract_path_segments(self, path: str) -> List[str]:
        """Extract path segments from endpoint path"""
        # Remove leading/trailing slashes and split
        return [s for s in path.split('/') if s]
    
    def _calculate_path_similarity(self, path1: str, path2: str) -> float:
        """Calculate similarity between two paths (0-1)"""
        segments1 = self._extract_path_segments(path1)
        segments2 = self._extract_path_segments(path2)
        
        # Match segments
        matches = sum(1 for s1, s2 in zip(segments1, segments2) if s1 == s2)
        max_segments = max(len(segments1), len(segments2))
        
        if max_segments == 0:
            return 0.0
        
        return matches / max_segments
    
    def _find_closest_documented_endpoint(self, path: str) -> Optional[Tuple[str, float]]:
        """Find most similar documented endpoint"""
        best_match = None
        best_similarity = 0.0
        
        for ep in self.documented_endpoints:
            similarity = self._calculate_path_similarity(path, ep.path)
            if similarity > best_similarity:
                best_similarity = similarity
                best_match = ep.path
        
        return (best_match, best_similarity) if best_similarity > 0.3 else None
    
    def _analyze_path_anomalies(self, path: str, method: str) -> Tuple[List[BehaviorAnomalyType], float]:
        """Analyze path for anomalies"""
        anomalies = []
        risk_score = 0.0
        
        # Check for suspicious patterns
        segments = self._extract_path_segments(path)
        
        # Admin/debug paths
        if any(seg in ['admin', 'debug', 'internal', '_'] for seg in segments):
            anomalies.append(BehaviorAnomalyType.ELEVATED_PRIVILEGE)
            risk_score += 25
        
        # Direct resource manipulation (unusual structure)
        if len(segments) > 6:
            anomalies.append(BehaviorAnomalyType.PATTERN_MISMATCH)
            risk_score += 10
        
        # Check for data exposure patterns
        if any(keyword in path.lower() for keyword in ['password', 'token', 'secret', 'key', 'apikey']):
            anomalies.append(BehaviorAnomalyType.DATA_EXPOSURE)
            risk_score += 30
        
        # Unusual HTTP methods for CRUD operations
        if method not in ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'HEAD', 'OPTIONS']:
            anomalies.append(BehaviorAnomalyType.UNAUTHORIZED_METHOD)
            risk_score += 15
        
        # Check if path doesn't follow documented pattern
        closest = self._find_closest_documented_endpoint(path)
        if not closest or closest[1] < 0.5:
            anomalies.append(BehaviorAnomalyType.PATTERN_MISMATCH)
            risk_score += 15
        
        return anomalies, risk_score
    
    def _analyze_behavioral_patterns(self, behavioral_data: dict) -> Tuple[List[BehaviorAnomalyType], float]:
        """Analyze behavioral patterns for anomalies"""
        anomalies = []
        risk_score = 0.0
        
        # Check request rate
        avg_requests_per_hour = behavioral_data.get('average_requests_per_hour', 0)
        if avg_requests_per_hour > 100:  # Suspicious rate
            anomalies.append(BehaviorAnomalyType.RAPID_REQUESTS)
            risk_score += 20
        
        # Check payload sizes
        avg_payload = behavioral_data.get('avg_payload_size', 0)
        max_payload = behavioral_data.get('max_payload_size', 0)
        if max_payload > 10_000_000:  # Over 10MB
            anomalies.append(BehaviorAnomalyType.LARGE_PAYLOAD)
            risk_score += 15
        
        # Check response codes for anomalies
        status_dist = behavioral_data.get('status_code_distribution', {})
        if '401' in status_dist or '403' in status_dist:
            # Many unauthorized responses
            if status_dist.get('401', 0) + status_dist.get('403', 0) > sum(status_dist.values()) * 0.3:
                anomalies.append(BehaviorAnomalyType.UNAUTHORIZED_METHOD)
                risk_score += 20
        
        # Check for unusual parameters
        params = behavioral_data.get('parameter_patterns', {})
        if any(p in params for p in ['sql', 'cmd', 'exec', 'shell', 'bash']):
            anomalies.append(BehaviorAnomalyType.UNUSUAL_PARAMETER)
            risk_score += 30
        
        return anomalies, risk_score
    
    def _calculate_risk_score(self,
                            path: str,
                            method: str,
                            behavioral_data: dict,
                            similarity_to_documented: Optional[float]) -> Tuple[float, ShadowAPIRiskLevel]:
        """Calculate comprehensive risk score (0-100)"""
        risk_score = 0.0
        
        # Path-based scoring
        path_anomalies, path_risk = self._analyze_path_anomalies(path, method)
        risk_score += path_risk
        
        # Behavioral scoring
        behavior_anomalies, behavior_risk = self._analyze_behavioral_patterns(behavioral_data)
        risk_score += behavior_risk
        
        # Similarity to documented endpoint
        if similarity_to_documented:
            if similarity_to_documented > 0.8:
                risk_score -= 10  # Likely documented variant
            elif similarity_to_documented < 0.3:
                risk_score += 15  # Very different from documented
        
        # Normalize to 0-100
        risk_score = min(100, max(0, risk_score))
        
        # Determine risk level
        if risk_score >= 75:
            risk_level = ShadowAPIRiskLevel.CRITICAL
        elif risk_score >= 55:
            risk_level = ShadowAPIRiskLevel.HIGH
        elif risk_score >= 35:
            risk_level = ShadowAPIRiskLevel.MEDIUM
        else:
            risk_level = ShadowAPIRiskLevel.LOW
        
        return risk_score, risk_level
    
    def _calculate_confidence(self, request_count: int, unique_users: int, days_observed: int) -> float:
        """Calculate confidence in shadow API detection (0-1)"""
        # More requests = higher confidence
        request_confidence = min(1.0, request_count / 100)  # 100+ requests = high confidence
        
        # More users = higher confidence
        user_confidence = min(1.0, unique_users / 10)  # 10+ users = high confidence
        
        # More days observed = higher confidence
        day_confidence = min(1.0, days_observed / 30)  # 30+ days = high confidence
        
        # Weighted average
        return (request_confidence * 0.5 + user_confidence * 0.3 + day_confidence * 0.2)
    
    def _generate_remediation_items(self,
                                   path: str,
                                   risk_level: ShadowAPIRiskLevel,
                                   anomaly_types: List[BehaviorAnomalyType],
                                   compliance_reqs: List[str]) -> List[str]:
        """Generate remediation recommendations"""
        items = []
        
        if risk_level == ShadowAPIRiskLevel.CRITICAL:
            items.append("URGENT: Disable or block this endpoint immediately")
            items.append("Conduct security audit to understand how endpoint was exposed")
            items.append("Review access logs for policy violations")
        elif risk_level == ShadowAPIRiskLevel.HIGH:
            items.append("Investigate endpoint purpose and authorization")
            items.append("Implement authentication/authorization if missing")
            items.append("Add endpoint to API documentation")
        else:
            items.append("Document this endpoint if intentional")
            items.append("Review endpoint permissions")
            items.append("Add to API inventory for tracking")
        
        # Specific remediation based on anomalies
        if BehaviorAnomalyType.ELEVATED_PRIVILEGE in anomaly_types:
            items.append("Restrict access to authorized users only")
            items.append("Implement role-based access control")
        
        if BehaviorAnomalyType.DATA_EXPOSURE in anomaly_types:
            items.append("Audit response data for sensitive information leakage")
            items.append("Implement data masking/redaction if needed")
        
        if BehaviorAnomalyType.UNAUTHORIZED_METHOD in anomaly_types:
            items.append("Verify HTTP method is appropriate")
            items.append("Restrict methods to documented set")
        
        # Compliance-driven remediation
        if compliance_reqs:
            items.append(f"Ensure compliance with: {', '.join(compliance_reqs)}")
            items.append("Update compliance tracking in security team")
        
        return items
    
    async def detect_shadow_apis(self,
                                user_id: str,
                                lookback_days: int = 30,
                                min_requests: int = 5) -> List[ShadowAPIDiscovery]:
        """
        Detect shadow APIs from endpoint usage data
        
        Args:
            user_id: User ID for RLS filtering
            lookback_days: Number of days to analyze
            min_requests: Minimum requests to consider endpoint
        
        Returns:
            List of detected shadow APIs sorted by risk
        """
        
        # Get endpoint usage data
        start_date = (datetime.utcnow() - timedelta(days=lookback_days)).isoformat()
        
        try:
            response = self.client.table("endpoint_requests") \
                .select("*") \
                .eq("user_id", user_id) \
                .gte("created_at", start_date) \
                .execute()
            
            request_data = response.data or []
        except Exception as e:
            print(f"Error fetching endpoint requests: {e}")
            return []
        
        # Group requests by endpoint
        endpoint_groups: Dict[str, list] = defaultdict(list)
        for req in request_data:
            key = f"{req['http_method']}:{req['endpoint_path']}"
            endpoint_groups[key].append(req)
        
        # Analyze each endpoint
        shadow_apis = []
        
        for endpoint_key, requests in endpoint_groups.items():
            if len(requests) < min_requests:
                continue  # Skip endpoints with too few requests
            
            method, path = endpoint_key.split(':', 1)
            
            # Check if documented
            if self._is_documented(path, method):
                continue  # Skip documented endpoints
            
            # Analyze behavior
            behavioral_data = self._analyze_endpoint_behavior(requests)
            
            # Find similarity to documented
            closest_match = self._find_closest_documented_endpoint(path)
            similarity = closest_match[1] if closest_match else 0.0
            
            # Calculate risk
            risk_score, risk_level = self._calculate_risk_score(
                path, method, behavioral_data, similarity
            )
            
            # Calculate confidence
            days_observed = (datetime.fromisoformat(requests[-1]['created_at']).date() -
                           datetime.fromisoformat(requests[0]['created_at']).date()).days + 1
            confidence = self._calculate_confidence(
                len(requests),
                len(set(r.get('user_source', 'unknown') for r in requests)),
                days_observed
            )
            
            # Get anomalies
            path_anomalies, _ = self._analyze_path_anomalies(path, method)
            behavior_anomalies, _ = self._analyze_behavioral_patterns(behavioral_data)
            all_anomalies = list(set(path_anomalies + behavior_anomalies))
            
            # Link to compliance
            compliance_reqs = await self._link_to_compliance(
                user_id, path, method, risk_level
            )
            
            # Generate remediation
            remediation = self._generate_remediation_items(
                path, risk_level, all_anomalies, compliance_reqs
            )
            
            # Build discovery record
            discovery = ShadowAPIDiscovery(
                endpoint_path=path,
                http_method=method,
                first_seen=datetime.fromisoformat(requests[0]['created_at']),
                last_seen=datetime.fromisoformat(requests[-1]['created_at']),
                request_count=len(requests),
                unique_users=len(set(r.get('user_id') for r in requests)),
                avg_response_time_ms=behavioral_data.get('avg_response_time_ms', 0),
                risk_level=risk_level,
                risk_score=risk_score,
                confidence=confidence,
                anomaly_types=all_anomalies,
                behavioral_patterns=behavioral_data,
                affected_compliance=compliance_reqs,
                remediation_items=remediation
            )
            
            shadow_apis.append(discovery)
        
        # Sort by risk score (highest first)
        shadow_apis.sort(key=lambda x: x.risk_score, reverse=True)
        
        return shadow_apis
    
    def _analyze_endpoint_behavior(self, requests: List[dict]) -> dict:
        """Analyze behavioral patterns of endpoint requests"""
        response_times = []
        payload_sizes = []
        status_codes: Dict[int, int] = defaultdict(int)
        parameters: Dict[str, int] = defaultdict(int)
        hourly_requests: Dict[int, int] = defaultdict(int)
        
        for req in requests:
            # Response time
            if 'response_time_ms' in req:
                response_times.append(req['response_time_ms'])
            
            # Payload size
            if 'payload_size' in req:
                payload_sizes.append(req['payload_size'])
            
            # Status code
            status = req.get('response_status', 200)
            status_codes[status] += 1
            
            # Parameters
            if 'query_params' in req:
                try:
                    params = json.loads(req['query_params'])
                    for k in params.keys():
                        parameters[k] += 1
                except:
                    pass
            
            # Hourly distribution
            try:
                hour = datetime.fromisoformat(req['created_at']).hour
                hourly_requests[hour] += 1
            except:
                pass
        
        avg_response_time = mean(response_times) if response_times else 0.0
        max_response_time = max(response_times) if response_times else 0
        avg_payload_size = mean(payload_sizes) if payload_sizes else 0
        max_payload_size = max(payload_sizes) if payload_sizes else 0
        
        # Calculate request rate
        hours_observed = len(hourly_requests) if hourly_requests else 1
        avg_requests_per_hour = len(requests) / max(hours_observed, 1)
        peak_hour = max(hourly_requests.values()) if hourly_requests else 0
        
        # Check if periodic
        is_periodic = len(hourly_requests) > 0 and len(set(hourly_requests.values())) <= 2
        
        return {
            'total_requests': len(requests),
            'unique_sources': len(set(r.get('source_ip', 'unknown') for r in requests)),
            'avg_response_time_ms': avg_response_time,
            'max_response_time_ms': max_response_time,
            'avg_payload_size': avg_payload_size,
            'max_payload_size': max_payload_size,
            'status_code_distribution': dict(status_codes),
            'parameter_patterns': dict(parameters),
            'temporal_patterns': dict(hourly_requests),
            'average_requests_per_hour': avg_requests_per_hour,
            'peak_hour_requests': peak_hour,
            'is_periodic': is_periodic
        }
    
    async def _link_to_compliance(self,
                                user_id: str,
                                path: str,
                                method: str,
                                risk_level: ShadowAPIRiskLevel) -> List[str]:
        """Link shadow API to affected compliance requirements"""
        compliance_reqs = []
        
        try:
            # Get compliance requirements
            response = self.client.table("compliance_requirements") \
                .select("*") \
                .eq("user_id", user_id) \
                .execute()
            
            requirements = response.data or []
            
            # Check for sensitive data requirements
            if risk_level in [ShadowAPIRiskLevel.HIGH, ShadowAPIRiskLevel.CRITICAL]:
                for req in requirements:
                    if any(keyword in req.get('title', '').lower() 
                           for keyword in ['data', 'access', 'authentication', 'authorization']):
                        compliance_reqs.append(req.get('requirement_id'))
        
        except Exception as e:
            print(f"Error linking to compliance: {e}")
        
        return compliance_reqs
    
    async def get_shadow_api_analytics(self, user_id: str) -> dict:
        """Get analytics about shadow APIs"""
        try:
            response = self.client.table("shadow_api_discoveries") \
                .select("*") \
                .eq("user_id", user_id) \
                .order("discovered_at", desc=True) \
                .execute()
            
            shadow_apis = response.data or []
            
            if not shadow_apis:
                return {
                    'total_shadow_apis': 0,
                    'critical_count': 0,
                    'high_count': 0,
                    'medium_count': 0,
                    'low_count': 0,
                    'avg_risk_score': 0,
                    'compliance_violations': 0
                }
            
            risk_counts = defaultdict(int)
            total_risk = 0
            compliance_violations = 0
            
            for api in shadow_apis:
                risk_level = api.get('risk_level')
                risk_counts[risk_level] += 1
                total_risk += api.get('risk_score', 0)
                
                if api.get('affected_compliance_ids'):
                    compliance_violations += 1
            
            return {
                'total_shadow_apis': len(shadow_apis),
                'critical_count': risk_counts.get('critical', 0),
                'high_count': risk_counts.get('high', 0),
                'medium_count': risk_counts.get('medium', 0),
                'low_count': risk_counts.get('low', 0),
                'avg_risk_score': total_risk / len(shadow_apis) if shadow_apis else 0,
                'compliance_violations': compliance_violations
            }
        
        except Exception as e:
            print(f"Error getting shadow API analytics: {e}")
            return {}
    
    async def dismiss_shadow_api(self, user_id: str, discovery_id: str, reason: str) -> bool:
        """Mark a shadow API discovery as dismissed/false positive"""
        try:
            self.client.table("shadow_api_discoveries") \
                .update({"status": "dismissed", "dismissal_reason": reason}) \
                .eq("id", discovery_id) \
                .eq("user_id", user_id) \
                .execute()
            
            return True
        except Exception as e:
            print(f"Error dismissing shadow API: {e}")
            return False
    
    async def whitelist_shadow_api(self, user_id: str, discovery_id: str) -> bool:
        """Whitelist a shadow API as authorized"""
        try:
            self.client.table("shadow_api_discoveries") \
                .update({"status": "whitelisted"}) \
                .eq("id", discovery_id) \
                .eq("user_id", user_id) \
                .execute()
            
            # Also update endpoint inventory to mark as documented
            # This would sync back to endpoint tracking
            return True
        except Exception as e:
            print(f"Error whitelisting shadow API: {e}")
            return False
