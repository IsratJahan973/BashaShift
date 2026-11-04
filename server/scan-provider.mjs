import {ScanError,recognizeFurniture as recognizeOpenAI} from './ai.mjs';
import {recognizeCloudflareFurniture,CLOUDFLARE_MISTRAL_MODEL,CLOUDFLARE_VISION_MODELS} from './cloudflare-ai.mjs';

export function createFurnitureRecognizer({env,fetchImpl,timeoutMs=25000,logScanFailure}){
  const accountId=env.CLOUDFLARE_ACCOUNT_ID?.trim()||'',token=env.CLOUDFLARE_AI_TOKEN?.trim()||'';
  const model=env.CLOUDFLARE_VISION_MODEL?.trim()||CLOUDFLARE_MISTRAL_MODEL;
  const cloudflareReady=CLOUDFLARE_VISION_MODELS.includes(model)&&/^[a-f\d]{32}$/i.test(accountId)&&token.length>0&&token.length<=8192&&!/\s/.test(token);
  const key=(env.OPENAI_API_KEY||env.BASHASHIFT_OPENAI_API_KEY||'').trim();
  const fallbackReady=env.AI_ENABLE_OPENAI_FALLBACK==='true'&&Boolean(key);
  return {
    configured:cloudflareReady||fallbackReady,
    async recognize({images,signal,requestId}){
      if(!cloudflareReady&&!fallbackReady)throw new ScanError(503,'ai_not_configured','AI photo analysis is not configured here. Add items manually.');
      const overall=AbortSignal.timeout(timeoutMs);
      const combined=signal?AbortSignal.any([signal,overall]):overall;
      if(combined.aborted)throw new ScanError(504,'ai_timeout','Photo analysis took too long. Retry or enter items manually.');
      if(cloudflareReady){
        try{
          // Reserve part of the existing total deadline for an explicitly enabled backup.
          return await recognizeCloudflareFurniture({images,accountId,token,model,fetchImpl,signal:combined,requestId,logFailure:logScanFailure,
            timeoutMs:fallbackReady?Math.max(1,Math.floor(timeoutMs*0.6)):timeoutMs});
        }catch(error){
          if(!fallbackReady||combined.aborted||!(error instanceof ScanError)||error.status<500)throw error;
        }
      }
      return recognizeOpenAI({images,key,model:env.OPENAI_MODEL||'gpt-4.1-mini',fetchImpl,timeoutMs,signal:combined});
    },
  };
}
