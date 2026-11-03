import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Optional: load .env without shipping or exposing it to frontend.
try { const dotenv = await import('dotenv'); dotenv.config(); } catch { /* environment variables from host */ }
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '5mb' }));
app.get('/api/health', (req,res) => res.json({ ok: true, aiConfigured: Boolean(process.env.OPENAI_API_KEY) }));
app.post('/api/scan', async (req,res) => {
  if (!process.env.OPENAI_API_KEY) return res.status(503).json({ error: 'AI scan not configured. Add OPENAI_API_KEY to the server environment.' });
  const image = req.body?.image;
  if (typeof image !== 'string' || !/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/.test(image) || image.length > 4_500_000) return res.status(400).json({error:'Provide a JPEG, PNG, or WEBP photo smaller than 3 MB.'});
  const prompt = `You analyze a single household photo to help a customer prepare a MOVING INVENTORY for a moving quote. Return ONLY clearly visible, movable household objects in categories: Bed, Sofa, Refrigerator, Wardrobe, Dining table, Washing machine, Boxes, Other. Don't infer hidden items; omit uncertain objects. Group repeated same-category objects with quantities. Provide confidence high/medium/low. Not all furniture may be visible; the customer must review your results. If nothing recognizable, return an empty items array.`;
  try {
    const r = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4.1-mini',
        store: false,
        input: [{ role:'user', content:[{type:'input_text',text:prompt},{type:'input_image',image_url:image,detail:'low'}] }],
        text: { format: { type:'json_schema', name:'moving_inventory', strict:true, schema: {
          type:'object', additionalProperties:false,
          properties:{ items:{type:'array',items:{type:'object',additionalProperties:false,properties:{name:{type:'string',enum:['Bed','Sofa','Refrigerator','Wardrobe','Dining table','Washing machine','Boxes','Other']},qty:{type:'integer'},confidence:{type:'string',enum:['high','medium','low']}},required:['name','qty','confidence']}}}, required:['items']
        } } }, max_output_tokens: 500
      })
    });
    const result = await r.json();
    if (!r.ok) return res.status(502).json({error:'AI provider error. Check server settings and try again.'});
    const output = result.output?.flatMap(o=>o.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join('') || '';
    const parsed = JSON.parse(output);
    const allowed = ['Bed','Sofa','Refrigerator','Wardrobe','Dining table','Washing machine','Boxes','Other'];
    const items = Array.isArray(parsed.items) ? parsed.items.filter(x=>allowed.includes(x.name)&&Number.isInteger(x.qty)&&x.qty>0).map(x=>({name:x.name,qty:Math.min(20,x.qty),confidence:x.confidence})).slice(0,20) : [];
    return res.json({ items, model:process.env.OPENAI_MODEL || 'gpt-4.1-mini', source:'live-ai' });
  } catch {
    return res.status(502).json({error:'Could not analyze the photo. Please enter the items manually.'});
  }
});

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dist = path.join(root,'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*',(req,res)=>res.sendFile(path.join(dist,'index.html')));
}
const port = process.env.PORT || 8787;
app.listen(port,()=>console.log(`BashaShift server on :${port}${fs.existsSync(dist)?' (serving dist)':''}`));
