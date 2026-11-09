import { appHome, home, exec, readTextFile, writeTextFile, shared } from "herdr";
export function checkPaneUpdate(cx){
 if(shared("layout")!=="traveler" || localStorage.getItem('minimal-tabs-1'))return;
 localStorage.setItem('minimal-tabs-1','started');
 cx.spawn(async()=>{
 const base=appHome(),bin=home()+'/AppData/Local/Programs/herdr-app/herdr-app.exe',result=[];
 for(const name of ['traveler-tabs'])result.push({name,...await exec(bin,['check',base+'/mods/'+name])});
 result.push({status:await exec(bin,['status'])});
 result.push({shot:await exec(bin,['shot',base+'/data/traveler-install/minimal-tabs.png'])});
 const file=base+'/data/traveler-install/minimal-tabs.json';
 await writeTextFile(file,JSON.stringify(result,null,2),await readTextFile(file));
 });
}
