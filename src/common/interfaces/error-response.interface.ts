export interface ErrorResponse {
    statusCode: number;
    message: string;
    timestamp?: string;
    path: string;
    method: string;
    stack?: string;
    errors?: any[];
    body?: any;
    query?: any;
    user?: any;
}