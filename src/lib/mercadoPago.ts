export function openMercadoPago(): boolean {
  const opened = window.open('https://www.mercadopago.com.ar/', '_blank', 'noopener,noreferrer');
  return Boolean(opened);
}
