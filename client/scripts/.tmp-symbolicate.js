const fs=require('fs');
const {SourceMapConsumer}=require('source-map');
const mapPath='.expo-export/_expo/static/js/android/index-63bc2e09a2e286f4d45ac85dbeddde0c.hbc.map';
const raw=JSON.parse(fs.readFileSync(mapPath,'utf8'));
const targets=[1211348,377640,395072,414263,413394,413226,367133,425787,359846,360134,423047,108601,107041,107982,106999,423349];
(async()=>{
 const consumer=await new SourceMapConsumer(raw);
 for(const col of targets){
   const pos=consumer.originalPositionFor({line:1,column:col});
   console.log(`1:${col} => ${pos.source||'null'}:${pos.line||0}:${pos.column||0} name=${pos.name||''}`);
 }
 consumer.destroy();
})();
