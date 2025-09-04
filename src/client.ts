/*
 * MIT License
 * Copyright (c) 2025 TERRAKERNEL PTE. LTD.
 * Author Julian Richie Wajong
 */
import axios, {AxiosInstance} from "axios";

export interface OdxInstanceInfo{
    url: string;
    user_id: number;
    db: string;
    api_key: string;
}

export interface OdxProxyClientInfo{
    instance: OdxInstanceInfo;
    odx_api_key: string
    gateway_url?: string;
}

export interface OdxClientRequestContext{
    allowed_company_ids?: number[];
    default_company_id?: number;
    tz: string;
}

export interface OdxServerErrorResponse {
    code: number;
    message: string;
    data: any;
}

export interface OdxServerResponse{
    jsonrpc: string;
    id: string;
    result?: any;
    error?: OdxServerErrorResponse;
}

export interface OdxClientKeywordRequest{
    fields?: string[];
    sort?: string;
    limit?: number;
    offset?: number;
    context: OdxClientRequestContext;
}

export interface OdxClientRequest {
    id: string;
    action: string;
    model_id: string;
    keyword: OdxClientKeywordRequest,
    fn_name?: string,
    params: any[],
    odoo_instance: OdxInstanceInfo
}

export class OdxProxyClient {
    private static instance: OdxProxyClient | null = null;
    private api: AxiosInstance;
    private OdooInstance: OdxInstanceInfo;
    private gatewayUrl: string;

    private constructor(options: OdxProxyClientInfo) {
        this.OdooInstance = options.instance;
        let gatewayUrl = options.gateway_url ?? "https://gateway.odxproxy.io";
        if (gatewayUrl.endsWith("/")) {
            gatewayUrl = gatewayUrl.slice(0, -1);
        }
        this.gatewayUrl = gatewayUrl;
        this.api = axios.create({
            baseURL: this.gatewayUrl,
            headers: {
                "accept": "application/json",
                "content-type": "application/json",
                "x-api-key": options.odx_api_key
            },
            timeout: 45000
        })
    }

    static init(options: OdxProxyClientInfo){
        if(OdxProxyClient.instance){
            throw new Error("OdxProxyClient has already been initialized.");
        }
        OdxProxyClient.instance = new OdxProxyClient(options);
        return OdxProxyClient.instance;
    }

    static getInstance(): OdxProxyClient {
        if (!OdxProxyClient.instance) {
            throw new Error("OdxProxyClient has not been initialized.");
        }
        return OdxProxyClient.instance;
    }

    async postRequest<T = any>(request: OdxClientRequest):Promise<OdxServerResponse & {result?: T}>  {
        try {
            const res = await this.api.request<OdxServerResponse & {result?: T}>(
                {
                    url: this.gatewayUrl + "/api/odoo/execute",
                    method: "POST",
                    data: request,
                });
            return res.data;
        } catch (err: any) {
            if (err.code === "ECONNABORTED") {
                throw {
                    code: 408,
                    message: "Request Timeout: exceeded client limit of " + this.api.defaults.timeout + "ms",
                    data: null,
                } as OdxServerErrorResponse;
            }
            const status = err.response?.status ?? 500;
            const rawData = err.response?.data;
            throw {
                code: status,
                message: err.response?.statusText ?? err.message,
                data: typeof rawData === "string" ? {text: rawData} : rawData,
            } as OdxServerErrorResponse;
        }
    }

    getOdooInstance(): OdxInstanceInfo {
        return {...this.OdooInstance};
    }
}