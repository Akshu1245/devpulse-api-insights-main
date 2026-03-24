"""
Postman Collection v2.1 Parser Service

Recursively parses Postman Collection JSON and extracts:
- Endpoints (URLs)
- HTTP methods
- Headers
- Request bodies

Handles deeply nested folder structures and validates collection format.
"""

import json
from typing import Any, Dict, List, Optional


class PostmanParseError(Exception):
    """Raised when Postman collection format is invalid."""
    pass


def _extract_url(url_data: Any) -> str:
    """
    Extract URL string from Postman URL object.
    
    Postman can represent URL as:
    - string: "https://api.example.com/users"
    - object: {"raw": "https://api.example.com/users", "protocol": "https", ...}
    """
    if isinstance(url_data, str):
        return url_data.strip()
    elif isinstance(url_data, dict):
        return (url_data.get("raw") or "").strip()
    return ""


def _extract_headers(headers: Any) -> List[Dict[str, str]]:
    """
    Extract headers from Postman request.
    
    Filters out disabled headers and returns list of {key, value} dicts.
    """
    if not isinstance(headers, list):
        return []
    
    result = []
    for header in headers:
        if isinstance(header, dict) and header.get("disabled") is not True:
            key = header.get("key", "").strip()
            value = header.get("value", "").strip()
            if key:
                result.append({"key": key, "value": value})
    return result


def _extract_body(body_data: Any) -> str:
    """
    Extract request body from Postman request.
    
    Supports:
    - raw: {"mode": "raw", "raw": "..."}
    - urlencoded: form data
    - formdata: multipart
    - file: binary
    - graphql: GraphQL query
    """
    if not isinstance(body_data, dict):
        return ""
    
    mode = body_data.get("mode", "")
    
    if mode == "raw":
        return body_data.get("raw", "").strip()
    elif mode == "urlencoded":
        pairs = body_data.get("urlencoded", [])
        return "&".join(
            f"{p.get('key', '')}={p.get('value', '')}"
            for p in pairs
            if isinstance(p, dict) and p.get("disabled") is not True
        )
    elif mode == "formdata":
        pairs = body_data.get("formdata", [])
        return "&".join(
            f"{p.get('key', '')}={p.get('value', '')}"
            for p in pairs
            if isinstance(p, dict) and p.get("disabled") is not True
        )
    elif mode == "graphql":
        return body_data.get("graphql", {}).get("query", "")
    
    return ""


def _recurse_items(
    items: List[Any],
    parent_path: str = "",
    parent_folder_name: str = ""
) -> List[Dict[str, Any]]:
    """
    Recursively traverse Postman collection items (folders and requests).
    
    Args:
        items: List of Postman items (can be folders or requests)
        parent_path: Hierarchical path for organization
        parent_folder_name: Name of parent folder
    
    Returns:
        List of extracted endpoints
    """
    endpoints = []
    
    if not isinstance(items, list):
        return endpoints
    
    for item in items:
        if not isinstance(item, dict):
            continue
        
        item_name = item.get("name", "").strip() or "Untitled"
        current_path = f"{parent_path}/{item_name}" if parent_path else item_name
        
        # Check if this is a folder (has nested items)
        if "item" in item:
            nested_items = item.get("item", [])
            endpoints.extend(
                _recurse_items(nested_items, current_path, item_name)
            )
        # Otherwise, it's a request
        elif "request" in item:
            request = item.get("request")
            if not isinstance(request, dict):
                continue
            
            method = request.get("method", "GET").upper().strip()
            url = _extract_url(request.get("url"))
            
            # Skip if no URL
            if not url:
                continue
            
            headers = _extract_headers(request.get("header"))
            body = _extract_body(request.get("body"))
            
            endpoints.append({
                "name": item_name,
                "method": method,
                "url": url,
                "headers": headers,
                "body": body,
                "path": current_path,
                "folder": parent_folder_name,
                "description": item.get("description", "").strip()
            })
    
    return endpoints


def parse_postman_collection(collection_json: str) -> List[Dict[str, Any]]:
    """
    Parse Postman Collection v2.1 JSON string.
    
    Args:
        collection_json: JSON string of Postman collection
    
    Returns:
        List of extracted endpoints with structure:
        {
            "name": str,
            "method": str,
            "url": str,
            "headers": List[{"key": str, "value": str}],
            "body": str,
            "path": str,  # Hierarchical path
            "folder": str,  # Parent folder name
            "description": str
        }
    
    Raises:
        PostmanParseError: If JSON is invalid or collection format is wrong
    """
    try:
        data = json.loads(collection_json)
    except json.JSONDecodeError as e:
        raise PostmanParseError(f"Invalid JSON: {str(e)}")
    
    if not isinstance(data, dict):
        raise PostmanParseError("Collection must be a JSON object")
    
    # Validate Postman collection format
    if "info" not in data:
        raise PostmanParseError("Missing 'info' field in collection")
    
    if "item" not in data:
        raise PostmanParseError("Missing 'item' field in collection")
    
    info = data.get("info", {})
    if not isinstance(info, dict):
        raise PostmanParseError("'info' field must be an object")
    
    collection_name = info.get("name", "Untitled").strip() or "Untitled"
    
    items = data.get("item", [])
    if not isinstance(items, list):
        raise PostmanParseError("'item' field must be an array")
    
    endpoints = _recurse_items(items)
    
    return {
        "collection_name": collection_name,
        "collection_description": info.get("description", "").strip(),
        "endpoints": endpoints,
        "endpoint_count": len(endpoints)
    }


def validate_endpoint(endpoint: Dict[str, Any]) -> bool:
    """
    Validate that an extracted endpoint has required fields.
    
    Returns True if valid, False otherwise.
    """
    required_fields = ["name", "method", "url", "headers"]
    return all(field in endpoint for field in required_fields)
