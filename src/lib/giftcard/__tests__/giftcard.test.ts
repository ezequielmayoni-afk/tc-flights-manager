import { describe, it, expect } from 'vitest'
import { generateCode, promoCodeBody, validUntilFrom } from '../voucher'
import { manifest, preferenceBody, typicalInstallments, verifyWebhookSignature } from '../mp'
import { createHmac } from 'node:crypto'
import { usdToArs } from '../fx'

describe('gift card', () => {
  it('genera códigos SV-XXXX-XXXX sin caracteres ambiguos', () => {
    for (let i = 0; i < 50; i++) expect(generateCode()).toMatch(/^SV-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}-[ABCDEFGHJKMNPQRSTUVWXYZ23456789]{4}$/)
    expect(new Set(Array.from({ length: 200 }, generateCode)).size).toBe(200)
  })
  it('la vigencia es de 12 meses desde el pago', () => {
    expect(validUntilFrom(new Date('2026-10-26T15:00:00Z'))).toBe('2027-10-26')
  })
  it('el código de promoción es de monto fijo en USD, un uso y con vencimiento', () => {
    const b = promoCodeBody('SV-ABCD-EFGH', 250, '2027-10-26', 'pedido-1')
    expect(b.promotionCode).toBe('SV-ABCD-EFGH'); expect(b.modalities[0].discount).toBe(250); expect(b.modalities[0].fixedAmount).toBe(true)
    expect(b.modalities[0].limitUses).toBe(1); expect(b.modalities[0].toBookingDate).toBe('2027-10-26'); expect(b.redeemDate).toBe('2027-10-26')
  })
  it('la preferencia de MP lleva las cuotas elegidas como máximo y por defecto, en pesos', () => {
    const p = preferenceBody({ id: '11111111-2222-4333-8444-555555555555', amountUsd: 100, amountArs: 150000, installments: 6, buyer: { name: 'Ana', lastname: 'Pérez', email: 'ana@x.com', phone: '11 5555 1234', document: '20123456789' } }, new Date('2026-10-26T12:00:00Z'))
    expect(p.items[0].unit_price).toBe(150000); expect(p.items[0].currency_id).toBe('ARS')
    expect(p.payment_methods.installments).toBe(6); expect(p.payment_methods.default_installments).toBe(6)
    expect(p.external_reference).toBe('11111111-2222-4333-8444-555555555555')
    expect(p.payer.identification).toEqual({ type: 'CUIL', number: '20123456789' })
    expect(p.back_urls.success).toContain('gc=11111111-2222-4333-8444-555555555555')
    expect(p.expiration_date_from).toMatch(/-03:00$/)
  })
  it('las cuotas estimadas son el plan más común entre emisores, no el primero que devuelve MP', () => {
    const pc = (installments: number, rate: number, amount: number) => ({ installments, installment_rate: rate, installment_amount: amount, total_amount: amount * installments })
    const entries = [
      { issuer: { name: 'Banco caro' }, payer_costs: [pc(1, 0, 150000), pc(12, 55.39, 19424)] },
      { issuer: { name: 'Banco A' }, payer_costs: [pc(1, 0, 150000), pc(12, 0, 12500)] },
      { issuer: { name: 'Banco B' }, payer_costs: [pc(1, 0, 150000), pc(12, 0, 12500), pc(6, 0, 25000)] },
      { issuer: { name: 'Banco C' }, payer_costs: [pc(12, 55.39, 19424)] },
      { issuer: { name: 'Banco D' }, payer_costs: [pc(12, 0, 12500)] },
    ]
    const q = typicalInstallments(entries, [1, 6, 12])
    expect(q.map((x) => [x.n, x.ratePct, x.installmentArs])).toEqual([[1, 0, 150000], [6, 0, 25000], [12, 0, 12500]])
    // empate → el plan más caro, para no prometer de más
    const tie = typicalInstallments(entries.slice(0, 2).concat([{ issuer: { name: 'Banco E' }, payer_costs: [pc(12, 55.39, 19424)] }]), [12])
    expect(tie[0].ratePct).toBe(55.39)
  })
  it('convierte a pesos redondos', () => { expect(usdToArs(50, 1500)).toBe(75000); expect(usdToArs(33, 1499.5)).toBe(49484) })
  it('verifica la firma del webhook como MP la arma', () => {
    const secret = 'abc'; const ts = '1700000000'; const dataId = '123'; const reqId = 'req-1'
    const v1 = createHmac('sha256', secret).update(manifest({ dataId, requestId: reqId, ts })).digest('hex')
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: reqId, dataId, secret })).toBe(true)
    expect(verifyWebhookSignature({ xSignature: `ts=${ts},v1=${v1}`, xRequestId: reqId, dataId: '999', secret })).toBe(false)
  })
})
