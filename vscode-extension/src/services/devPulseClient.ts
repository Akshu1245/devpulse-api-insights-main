import * as vscode from "vscode";
import axios, { AxiosInstance } from "axios";

/**
 * DevPulse API Client for communicating with backend
 * Handles authentication and API operations
 */
export class DevPulseClient {
  private axiosInstance: AxiosInstance;
  private baseURL: string;
  private token: string | null = null;
  private userId: string | null = null;
  private connected: boolean = false;

  constructor(private context: vscode.ExtensionContext) {
    const config = vscode.workspace.getConfiguration("devpulse");
    this.baseURL = config.get<string>("apiEndpoint") || "http://localhost:8000";
    
    this.axiosInstance = axios.create({
      baseURL: this.baseURL,
      timeout: 10000,
      headers: {
        "Content-Type": "application/json"
      }
    });
  }

  async initialize(): Promise<void> {
    const config = vscode.workspace.getConfiguration("devpulse");
    this.token = config.get<string>("apiToken");

    if (this.token) {
      this.setupAuthorization();
      const result = await this.testConnection();
      this.connected = result.success;
    }
  }

  private setupAuthorization(): void {
    if (this.token) {
      this.axiosInstance.defaults.headers.common["Authorization"] = `Bearer ${this.token}`;
    }
  }

  async testConnection(): Promise<{ success: boolean; message: string }> {
    try {
      const response = await this.axiosInstance.get("/health");
      this.connected = response.status === 200;
      return { success: true, message: "Connected to DevPulse backend" };
    } catch (error) {
      this.connected = false;
      return { success: false, message: "Failed to connect to DevPulse backend" };
    }
  }

  async getConnectionStatus(): Promise<{ connected: boolean; endpoint: string; userId: string | null }> {
    return {
      connected: this.connected,
      endpoint: this.baseURL,
      userId: this.userId
    };
  }

  async scanEndpoints(filePath: string, fileContent: string): Promise<any[]> {
    try {
      const response = await this.axiosInstance.post("/analysis/scan", {
        file_path: filePath,
        content: fileContent
      });
      return response.data.endpoints || [];
    } catch (error) {
      console.error("Error scanning endpoints:", error);
      return [];
    }
  }

  async analyzeApiRisk(endpoint: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/api-risk/analyze`, {
        params: { endpoint }
      });
      return response.data;
    } catch (error) {
      console.error("Error analyzing API risk:", error);
      return null;
    }
  }

  async getComplianceRequirements(): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get("/compliance/requirements");
      return response.data.requirements || [];
    } catch (error) {
      console.error("Error fetching compliance requirements:", error);
      return [];
    }
  }

  async checkCompliance(endpoint: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/compliance/check`, {
        params: { endpoint }
      });
      return response.data;
    } catch (error) {
      console.error("Error checking compliance:", error);
      return null;
    }
  }

  async getShadowApis(): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get("/shadow-api/discoveries");
      return response.data.discoveries || [];
    } catch (error) {
      console.error("Error fetching shadow APIs:", error);
      return [];
    }
  }

  async getEndpointDetails(endpoint: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/endpoints/details`, {
        params: { path: endpoint }
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching endpoint details:", error);
      return null;
    }
  }

  async getDashboardMetrics(): Promise<any> {
    try {
      const response = await this.axiosInstance.get("/dashboard/metrics");
      return response.data;
    } catch (error) {
      console.error("Error fetching dashboard metrics:", error);
      return {};
    }
  }

  async getSecurityAlerts(): Promise<any[]> {
    try {
      const response = await this.axiosInstance.get("/security/alerts");
      return response.data.alerts || [];
    } catch (error) {
      console.error("Error fetching security alerts:", error);
      return [];
    }
  }

  async getApiDetails(path: string): Promise<any> {
    try {
      const response = await this.axiosInstance.get(`/endpoints/${encodeURIComponent(path)}`);
      return response.data;
    } catch (error) {
      console.error("Error getting API details:", error);
      return null;
    }
  }

  async reinitialize(): Promise<void> {
    await this.initialize();
  }

  dispose(): void {
    this.axiosInstance = null!;
  }

  isConnected(): boolean {
    return this.connected;
  }

  getEndpoint(): string {
    return this.baseURL;
  }
}
