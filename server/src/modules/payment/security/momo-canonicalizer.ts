type MomoPayload = Record<string, unknown>;

export class MomoCanonicalizer {
  createRequest(payload: MomoPayload, accessKey: string): string {
    return this.join(
      [
        'accessKey',
        'amount',
        'extraData',
        'ipnUrl',
        'orderId',
        'orderInfo',
        'partnerCode',
        'redirectUrl',
        'requestId',
        'requestType',
      ],
      { ...payload, accessKey },
    );
  }

  createResponse(payload: MomoPayload, accessKey: string): string {
    return this.join(
      [
        'accessKey',
        'amount',
        'message',
        'orderId',
        'partnerCode',
        'payUrl',
        'requestId',
        'responseTime',
        'resultCode',
      ],
      { ...payload, accessKey },
    );
  }

  ipn(payload: MomoPayload, accessKey: string): string {
    return this.join(
      [
        'accessKey',
        'amount',
        'extraData',
        'message',
        'orderId',
        'orderInfo',
        'orderType',
        'partnerCode',
        'payType',
        'requestId',
        'responseTime',
        'resultCode',
        'transId',
      ],
      { ...payload, accessKey },
    );
  }

  queryRequest(payload: MomoPayload, accessKey: string): string {
    return this.join(
      ['accessKey', 'orderId', 'partnerCode', 'requestId'],
      { ...payload, accessKey },
    );
  }

  private join(fields: string[], payload: MomoPayload): string {
    return fields.map((field) => `${field}=${String(payload[field] ?? '')}`).join('&');
  }
}
