export const propertyPhotoLimits=Object.freeze({count:6,each:8*1024*1024,total:24*1024*1024});
export const imageTypes=['image/jpeg','image/png','image/webp'];

// Canvas re-encoding is shared by the scanner and property uploads. Original
// files/metadata are never uploaded by these UI paths; the scan server sanitizes again.
export async function prepareImage(file,maxWidth=1100){
  if(!file||!imageTypes.includes(file.type))throw new Error('Use JPEG, PNG or WEBP images.');
  if(file.size>propertyPhotoLimits.each)throw new Error('Use images under 8 MB each.');
  const url=URL.createObjectURL(file);
  try{
    const img=await new Promise((resolve,reject)=>{const image=new Image();image.onload=()=>resolve(image);image.onerror=()=>reject(new Error('The image could not be opened.'));image.src=url;});
    const scale=Math.min(1,maxWidth/Math.max(img.width,img.height));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*scale));canvas.height=Math.max(1,Math.round(img.height*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    return canvas.toDataURL('image/jpeg',.78);
  }finally{URL.revokeObjectURL(url);}
}
