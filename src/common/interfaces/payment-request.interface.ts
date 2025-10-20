export interface PaymentRequest {
    amount: number;
    currency: string;
    email: string;
    phone_number: string;
    fullname: string;
    tx_ref: string;
    order_id?: string;
    meta?: any;
}

export interface PaymentResponse {
    status: string;
    messages: string;
    data?: any;
}