import {useEffect,useRef,useState} from 'react';
export default function RouteMap({route}){
  const container=useRef(null),map=useRef(null),bounds=useRef(null);
  const [error,setError]=useState(''),[loading,setLoading]=useState(true);
  useEffect(()=>{
    let active=true,instance;
    setError('');setLoading(true);
    Promise.all([import('leaflet'),import('leaflet/dist/leaflet.css')]).then(([module])=>{
      if(!active)return;
      const L=module.default||module;
      instance=L.map(container.current,{scrollWheelZoom:false,attributionControl:true,zoomControl:false,zoomAnimation:false,fadeAnimation:false,markerZoomAnimation:false});map.current=instance;
      instance.attributionControl.setPrefix(false);
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:18,keepBuffer:0,updateWhenIdle:true,
        attribution:'© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a> contributors'}).on('tileerror',()=>{if(active)setError('Map tiles are unavailable. The returned road line and distance remain usable.');}).addTo(instance);
      const points=route.geometry.coordinates.map(([lon,lat])=>[lat,lon]);
      const line=L.polyline(points,{color:'#21684e',weight:5}).addTo(instance);bounds.current=line.getBounds();
      for(const [point,label,name] of [[points[0],'A',route.from],[points.at(-1),'B',route.to]]){
        L.marker(point,{title:(label==='A'?'Start near ':'End near ')+name,alt:(label==='A'?'Start near ':'End near ')+name,
          icon:L.divIcon({className:'route-marker',html:label,iconSize:[30,30],iconAnchor:[15,30]})}).addTo(instance);
      }
      instance.fitBounds(bounds.current,{padding:[30,30],maxZoom:15,animate:false});setLoading(false);
    }).catch(()=>{if(active){setLoading(false);setError('Map could not be loaded. Distance and manual entry remain available.');}});
    return()=>{active=false;instance?.stop();instance?.remove();map.current=null;};
  },[route]);
  return <div className="route-map-wrapper">
    {loading&&<p role="status">Loading map…</p>}
    {error&&<p role="status" className="small">{error}</p>}
    <div ref={container} className="route-map" role="region" aria-label={`Road route from ${route.from} to ${route.to}`}/>
    <div className="route-map-footer">
      <button type="button" className="btn btn-small btn-outline" aria-label="Zoom in" disabled={loading||!map.current} onClick={()=>map.current?.zoomIn()}>+</button>
      <button type="button" className="btn btn-small btn-outline" aria-label="Zoom out" disabled={loading||!map.current} onClick={()=>map.current?.zoomOut()}>−</button>
      <button type="button" className="btn btn-small btn-outline" disabled={loading||!map.current} onClick={()=>map.current?.fitBounds(bounds.current,{padding:[30,30],maxZoom:15,animate:false})}>Reset map view</button>
      <small>Routing: <a href="https://openrouteservice.org/" target="_blank" rel="noopener noreferrer">HeiGIT/openrouteservice</a> · <a href="https://www.openstreetmap.org/fixthemap" target="_blank" rel="noopener noreferrer">Report a map issue</a></small></div>
  </div>;
}
