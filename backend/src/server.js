import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { createClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';
/**
 * StockSense API
 * Handles warehouses, products, stock operations (receipts, deliveries,
 * transfers, adjustments) and movement history.
 * Falls back to an in-memory demo dataset when Supabase env vars are not set.
 */
const app = express();
const port = Number(process.env.PORT || 4000);
app.use(cors({ origin: process.env.CLIENT_ORIGIN?.split(',') || true }));
app.use(express.json({ limit: '1mb' }));

const supabase = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } }) : null;
const demo = {
  warehouses: [
    { id: 'wh-main', name: 'Main warehouse', code: 'WH-MAIN', location: 'North District' },
    { id: 'wh-prod', name: 'Production Floor', code: 'WH-PROD', location: 'Factory Building' },
    { id: 'wh-east', name: 'East Outlet', code: 'WH-EAST', location: 'East District' }
  ],
  products: [
    { id: 'p-steel', name: 'Steel Rods', sku: 'STL-001', category: 'Raw Materials', unit: 'kg', reorder_level: 40 },
    { id: 'p-chair', name: 'Ergonomic Chair', sku: 'CHR-104', category: 'Furniture', unit: 'pcs', reorder_level: 20 },
    { id: 'p-oak', name: 'Oak Timber', sku: 'TIM-220', category: 'Raw Materials', unit: 'boards', reorder_level: 35 },
    { id: 'p-bolt', name: 'Hex Bolt M8', sku: 'BLT-008', category: 'Hardware', unit: 'pcs', reorder_level: 100 },
    { id: 'p-desk', name: 'Standing Desk', sku: 'DSK-310', category: 'Furniture', unit: 'pcs', reorder_level: 12 },
    { id: 'p-paint', name: 'Matte Black Paint', sku: 'PNT-055', category: 'Finishing', unit: 'litres', reorder_level: 15 }
  ], balances: {}, operations: [], movements: []
};
const seed = [['p-steel','wh-main',128],['p-steel','wh-prod',32],['p-chair','wh-main',18],['p-chair','wh-east',7],['p-oak','wh-main',54],['p-oak','wh-prod',16],['p-bolt','wh-main',240],['p-bolt','wh-prod',80],['p-desk','wh-main',8],['p-paint','wh-main',0],['p-paint','wh-east',4]];
for (const [p,w,q] of seed) demo.balances[`${p}:${w}`] = q;
const isDemo = !supabase;
const fail = (res, error, status=400) => res.status(status).json({ error });
async function rows(table, order='created_at') {
  const { data, error } = await supabase.from(table).select('*').order(order, { ascending: false });
  if (error) throw new Error(error.message); return data || [];
}
async function dataFor(product) {
  if (isDemo) return { ...product, stock: demo.warehouses.reduce((n,w)=>n+(demo.balances[`${product.id}:${w.id}`]||0),0), locations: demo.warehouses.map(w=>({warehouse_id:w.id,warehouse:w.name,quantity:demo.balances[`${product.id}:${w.id}`]||0})) };
  const [{ data: balances, error }, warehouses] = await Promise.all([supabase.from('stock_balances').select('warehouse_id,quantity').eq('product_id',product.id), rows('warehouses','name')]);
  if(error) throw new Error(error.message);
  const locations=(balances||[]).map(b=>({warehouse_id:b.warehouse_id,warehouse:warehouses.find(w=>w.id===b.warehouse_id)?.name||'Warehouse',quantity:Number(b.quantity)}));
  return { ...product, stock:locations.reduce((n,x)=>n+x.quantity,0), locations };
}
async function getProducts() { return Promise.all((isDemo ? demo.products : await rows('products')).map(dataFor)); }
async function getWarehouses() { return isDemo ? demo.warehouses : rows('warehouses','name'); }
async function getOperations() {
  if (isDemo) return demo.operations;
  const [ops, lines, products, warehouses] = await Promise.all([rows('operations'), rows('operation_lines'), rows('products','name'), rows('warehouses','name')]);
  return ops.map(o=>({...o, lines:lines.filter(l=>l.operation_id===o.id).map(l=>({...l,product:products.find(p=>p.id===l.product_id)})), source:warehouses.find(w=>w.id===o.source_warehouse_id)?.name, destination:warehouses.find(w=>w.id===o.destination_warehouse_id)?.name}));
}
async function getMovements() {
  if (isDemo) return demo.movements;
  const [moves, ops, products, warehouses]=await Promise.all([rows('stock_movements'),rows('operations'),rows('products','name'),rows('warehouses','name')]);
  return moves.map(m=>({...m,operation:ops.find(o=>o.id===m.operation_id),product:products.find(p=>p.id===m.product_id),warehouse:warehouses.find(w=>w.id===m.warehouse_id)?.name||'Warehouse'}));
}
app.get('/api/health',(_req,res)=>res.json({ok:true, mode:isDemo?'demo':'supabase'}));
app.get('/api/warehouses',async(_req,res)=>{try{res.json(await getWarehouses())}catch(e){fail(res,e.message,500)}});
app.get('/api/products',async(_req,res)=>{try{res.json(await getProducts())}catch(e){fail(res,e.message,500)}});
app.post('/api/products',async(req,res)=>{
  const {name,sku,category='General',unit='units',reorder_level=10}=req.body||{};
  if(!name?.trim()||!sku?.trim()) return fail(res,'Product name and SKU are required.');
  try {
    if(isDemo){if(demo.products.some(p=>p.sku.toLowerCase()===sku.trim().toLowerCase()))return fail(res,'That SKU already exists.');const p={id:randomUUID(),name:name.trim(),sku:sku.trim().toUpperCase(),category,unit,reorder_level:Number(reorder_level)};demo.products.unshift(p);return res.status(201).json(await dataFor(p))}
    const {data,error}=await supabase.from('products').insert({name:name.trim(),sku:sku.trim().toUpperCase(),category,unit,reorder_level:Number(reorder_level)}).select().single();if(error)throw error;res.status(201).json(await dataFor(data));
  }catch(e){fail(res,e.message,500)}
});
app.patch('/api/products/:id',async(req,res)=>{
 try{let p;if(isDemo){p=demo.products.find(x=>x.id===req.params.id);if(!p)return fail(res,'Product not found.',404);Object.assign(p,req.body)}else{const {data,error}=await supabase.from('products').update(req.body).eq('id',req.params.id).select().single();if(error)throw error;p=data}res.json(await dataFor(p))}catch(e){fail(res,e.message,500)}
});
app.get('/api/operations',async(_req,res)=>{try{res.json(await getOperations())}catch(e){fail(res,e.message,500)}});
app.post('/api/operations',async(req,res)=>{
 const {type,source_warehouse_id,destination_warehouse_id,partner='',note='',lines=[]}=req.body||{};
 if(!['receipt','delivery','transfer','adjustment'].includes(type))return fail(res,'Choose a valid operation type.');
 if(!lines.length||lines.some(l=>!l.product_id||!(Number(l.quantity)>0)))return fail(res,'Add at least one product with a quantity greater than zero.');
 if(['delivery','transfer','adjustment'].includes(type)&&!source_warehouse_id)return fail(res,'Choose a source warehouse.');
 if(type==='receipt'&&!destination_warehouse_id)return fail(res,'Choose a destination warehouse.');
 if(type==='transfer'&&(!destination_warehouse_id||destination_warehouse_id===source_warehouse_id))return fail(res,'Choose two different locations.');
 try{
  const reference=`${type.slice(0,3).toUpperCase()}-${String(Date.now()).slice(-6)}`;
  if(isDemo){const op={id:randomUUID(),reference,type,status:'ready',source_warehouse_id,destination_warehouse_id,partner,note,created_at:new Date().toISOString(),lines:lines.map(l=>({...l,quantity:Number(l.quantity),product:demo.products.find(p=>p.id===l.product_id)}))};demo.operations.unshift(op);return res.status(201).json(op)}
  const {data:op,error}=await supabase.from('operations').insert({reference,type,status:'ready',source_warehouse_id:source_warehouse_id||null,destination_warehouse_id:destination_warehouse_id||null,partner,note}).select().single();if(error)throw error;
  const {error:lineError}=await supabase.from('operation_lines').insert(lines.map(l=>({operation_id:op.id,product_id:l.product_id,quantity:Number(l.quantity),counted_quantity:l.counted_quantity??null})));if(lineError)throw lineError;res.status(201).json({...op,lines});
 }catch(e){fail(res,e.message,500)}
});
app.post('/api/operations/:id/validate',async(req,res)=>{
 try{
  const ops=await getOperations(),op=ops.find(x=>x.id===req.params.id);if(!op)return fail(res,'Operation not found.',404);if(op.status==='done')return fail(res,'This operation has already been validated.');
  for(const l of op.lines){if(!demo.products.concat([]).some(p=>p.id===l.product_id)&&isDemo)return fail(res,'Product not found.');if(['delivery','transfer','adjustment'].includes(op.type)){const qty=isDemo?(demo.balances[`${l.product_id}:${op.source_warehouse_id}`]||0):Number((await supabase.from('stock_balances').select('quantity').eq('product_id',l.product_id).eq('warehouse_id',op.source_warehouse_id).maybeSingle()).data?.quantity||0);const need=op.type==='adjustment'?0:Number(l.quantity);if(need>qty)return fail(res,`Not enough stock for ${l.product?.name||'a product'}. Available: ${qty}.`);}}
  if(isDemo){for(const l of op.lines){const src=`${l.product_id}:${op.source_warehouse_id}`,dst=`${l.product_id}:${op.destination_warehouse_id}`;if(op.type==='receipt')demo.balances[dst]=(demo.balances[dst]||0)+Number(l.quantity);if(op.type==='delivery')demo.balances[src]=(demo.balances[src]||0)-Number(l.quantity);if(op.type==='transfer'){demo.balances[src]=(demo.balances[src]||0)-Number(l.quantity);demo.balances[dst]=(demo.balances[dst]||0)+Number(l.quantity)}if(op.type==='adjustment'){const counted=Number(l.counted_quantity??l.quantity),previous=demo.balances[src]||0;demo.balances[src]=counted;l.delta=counted-previous;}else l.delta=Number(l.quantity)}op.status='done';op.validated_at=new Date().toISOString();demo.movements.unshift(...op.lines.map(l=>({id:randomUUID(),operation_id:op.id,reference:op.reference,type:op.type,product_id:l.product_id,product:l.product,warehouse_id:op.type==='receipt'?op.destination_warehouse_id:op.source_warehouse_id,warehouse:demo.warehouses.find(w=>w.id===(op.type==='receipt'?op.destination_warehouse_id:op.source_warehouse_id))?.name,delta:op.type==='delivery'?-l.delta:op.type==='adjustment'?l.delta:l.delta,created_at:op.validated_at})));return res.json(op)}
  // Supabase validation is performed per line; use an RPC transaction for strict atomicity in production.
  for(const l of op.lines){const warehouse=op.type==='receipt'?op.destination_warehouse_id:op.source_warehouse_id;const {data:bal}=await supabase.from('stock_balances').select('quantity').eq('product_id',l.product_id).eq('warehouse_id',warehouse).maybeSingle();const before=Number(bal?.quantity||0);let delta=op.type==='receipt'?Number(l.quantity):op.type==='adjustment'?Number(l.counted_quantity??l.quantity)-before:-Number(l.quantity);if(op.type==='transfer'){const {error}=await supabase.from('stock_balances').upsert({product_id:l.product_id,warehouse_id:op.destination_warehouse_id,quantity:Number((await supabase.from('stock_balances').select('quantity').eq('product_id',l.product_id).eq('warehouse_id',op.destination_warehouse_id).maybeSingle()).data?.quantity||0)+Number(l.quantity)},{onConflict:'product_id,warehouse_id'});if(error)throw error}
   const after=op.type==='adjustment'?Number(l.counted_quantity??l.quantity):before+delta;if(after<0)return fail(res,'This operation would make stock negative.');const {error:balErr}=await supabase.from('stock_balances').upsert({product_id:l.product_id,warehouse_id,quantity:after},{onConflict:'product_id,warehouse_id'});if(balErr)throw balErr;const entries=op.type==='transfer'?[{operation_id:op.id,product_id:l.product_id,warehouse_id,delta:-Number(l.quantity)},{operation_id:op.id,product_id:l.product_id,warehouse_id:op.destination_warehouse_id,delta:Number(l.quantity)}]:[{operation_id:op.id,product_id:l.product_id,warehouse_id,delta}];const {error:moveErr}=await supabase.from('stock_movements').insert(entries);if(moveErr)throw moveErr;
  }
  const {error}=await supabase.from('operations').update({status:'done',validated_at:new Date().toISOString()}).eq('id',op.id);if(error)throw error;res.json({...op,status:'done'});
 }catch(e){fail(res,e.message,500)}
});
app.get('/api/movements',async(_req,res)=>{try{res.json(await getMovements())}catch(e){fail(res,e.message,500)}});
app.get('/api/dashboard',async(_req,res)=>{
 try{const [products,operations,movements,warehouses]=await Promise.all([getProducts(),getOperations(),getMovements(),getWarehouses()]);const pending=operations.filter(o=>o.status==='ready');res.json({totalProducts:products.length,totalUnits:products.reduce((n,p)=>n+p.stock,0),lowStock:products.filter(p=>p.stock>0&&p.stock<=Number(p.reorder_level)),outOfStock:products.filter(p=>p.stock===0),pendingReceipts:pending.filter(o=>o.type==='receipt').length,pendingDeliveries:pending.filter(o=>o.type==='delivery').length,scheduledTransfers:pending.filter(o=>o.type==='transfer').length,products,operations,movements,warehouses,mode:isDemo?'demo':'supabase'})}catch(e){fail(res,e.message,500)}
});
app.use((err,_req,res,_next)=>{console.error(err);res.status(500).json({error:'Unexpected server error.'})});
app.listen(port,()=>console.log(`StockSense API running on http://localhost:${port} (${isDemo?'demo':'supabase'} mode)`));
