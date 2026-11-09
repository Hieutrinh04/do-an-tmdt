import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import QRCode from 'qrcode';
import { api, errorText, localDate, money, Order } from './api';

export function AdminAlerts({token}:{token:string}) {
  const [pending,setPending]=useState(0),[sound,setSound]=useState(false),[error,setError]=useState('');
  const previous=useRef<string|undefined>(undefined), audio=useRef<AudioContext|undefined>(undefined);
  useEffect(()=>{
    const controller=new AbortController();
    const refresh=async()=>{try{const value=await api<{pending:number;latestId:string}>('/admin/orders/summary',{token,signal:controller.signal});
      if(sound&&previous.current&&previous.current!==value.latestId&&audio.current){const ctx=audio.current;const oscillator=ctx.createOscillator(),gain=ctx.createGain();gain.gain.value=0.08;oscillator.frequency.value=660;oscillator.connect(gain);gain.connect(ctx.destination);oscillator.start();oscillator.stop(ctx.currentTime+0.15);}
      previous.current=value.latestId;setPending(value.pending);setError('');
    }catch(reason){if(!controller.signal.aborted)setError(errorText(reason));}};
    void refresh();const timer=window.setInterval(refresh,20000);return()=>{controller.abort();window.clearInterval(timer);};
  },[token,sound]);
  useEffect(()=>()=>{void audio.current?.close();},[]);
  return <aside className="line admin-alerts"><a href="/admin/orders" className="badge" aria-live="polite">Đơn chờ: {pending}</a>
    <label className="radio"><input type="checkbox" checked={sound} onChange={async e=>{const enabled=e.target.checked;try{if(enabled){audio.current??=new AudioContext();await audio.current.resume();}setSound(enabled);}catch{setError('Trình duyệt chưa cho phép âm báo.');}}}/> Âm báo đơn mới (tùy chọn)</label>
    {error&&<small role="status">{error}</small>}</aside>;
}
export function PackingLabel({order}:{order:Order}) {
  const [qr,setQr]=useState('');
  const url=new URL('/track?code='+encodeURIComponent(order.code),window.location.origin).toString();
  useEffect(()=>{let active=true;QRCode.toDataURL(url,{width:180,margin:1,errorCorrectionLevel:'M'}).then(value=>{if(active)setQr(value);}).catch(()=>setQr(''));return()=>{active=false;};},[url]);
  return <><button className="outline" onClick={()=>window.print()}>In phiếu A6</button>{createPortal(<article className="packing-label" aria-label="Phiếu đóng gói A6">
    <h1>LONG FISH · {order.code}</h1><p><strong>{order.customerName}</strong><br/>{order.phone}<br/>{order.address}</p>
    <p>Giờ nhận mong muốn: {order.preferredDelivery?localDate(order.preferredDelivery):'Chưa hẹn giờ'}</p>
    <table><thead><tr><th>Sản phẩm / phân loại</th><th>SL</th></tr></thead><tbody>{order.items.map(item=><tr key={item.id}><td>{item.productName}<br/>{item.color} / {item.size} / {item.gender}</td><td>{item.quantity} {item.unit}</td></tr>)}</tbody></table>
    <p>Tiền hàng: {money(order.subtotal)}<br/>Giao hàng: {money(order.shippingFee)} · Đóng gói: {money(order.packingFee)}<br/><strong>Tổng: {money(order.total)}</strong><br/>{order.paymentMethod==='COD'?'COD':'Chuyển khoản VietQR'} · {order.paymentStatus==='PAID'?'Đã thanh toán':'Chưa thanh toán'}</p>
    {order.hasLiveFish&&<strong className="live-warning">HÀNG SỐNG – NHẸ TAY / KHÔNG ĐỂ NẮNG</strong>}
    {qr?<a href={url}><img src={qr} width={100} height={100} alt="QR tra cứu đơn"/></a>:<p>Tra cứu tại {url}</p>}
    <small>Quét mã, nhập số điện thoại đặt hàng để xem trạng thái.</small>
  </article>,document.body)}</>;
}
