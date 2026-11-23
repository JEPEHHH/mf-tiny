import*as f from'fs';
let{MAKEFUN_INPUT_DIR:I='/input',MAKEFUN_OUTPUT_DIR:O='/output'}=process.env,A=Int32Array,E=65536,U=Buffer.alloc(E),R=f.readFileSync,W=f.writeFileSync,L,s,c,y,q,n,o,h,l,m,a,b,u,v,t,w,p,i,k,d,N,D,C,M;
for(d of f.readdirSync(I)){
d='/'+d;p=R(I+d+'/program.bin');i=R(I+d+'/input.bin');D=new A(256);C=new A(64);M=new A(256);N=p.length;s=c=y=q=n=L=0;
f.mkdirSync(k=O+d,{recursive:!0});
W(k+'/exit.txt',''+(()=>{for(;;){
if(n==1e6)return 10;if(q<0|q>=N)return 9;o=p[q];h=o>>4;l=o&15;t=o==23|o==27;
if(!(l<[8,15,3,5,2,4][h]))return 5;m=o<3?o*o&5:o>>2==12?2:0;if(q+m>=N)return 9;n++;
if(s<[l-1>>1,2-t,2,l==1|l==2,l+1,l!=2][h])return 2;if(s>255&(o<7&86>>o|o==82))return 3;q+=1+m;
if(!h){if(!l)return 0;l<3?D[s++]=l<2?p[q-1]<<24>>24:p.readInt32LE(q-4):l<4?s--:l<5?D[s]=D[s++-1]:l<6?D.set([D[s-1],D[s-2]],s-2):l<7?D[s]=D[s++-2]:D.set([D[s-2],D[s-1],D[s-3]],s-3)}
else if(h<3){b=t?0:D[--s];a=D[s-1];u=a>>>0;v=b>>>0;if(!b&o>18&o<23)return 4;D[s-1]=[a+b,a-b,Math.imul(a,b),a/b,a%b,u/v,u%v,-a,a&b,a|b,a^b,~a,a<<b,a>>b,a>>>b,,a==b,a<b,u<v][o-16]}
else if(h<4){w=p[q-2]|p[q-1]<<8;if(l>3){if(!c)return 8;q=C[--c]}else if(l>2){if(c>63)return 7;C[c++]=q;q=w}else if(!l||!D[--s]==l<2)q+=w<<16>>16}
else if(h<5){if((a=D[l?--s:s-1])>>>8)return 6;l?M[a]=D[--s]:D[s-1]=M[a]}
else if(!l){if(L+(b=''+D[--s]).length>E)return 11;L+=U.write(b,L)}
else if(l<2){if(L==E)return 11;U[L++]=D[--s]}
else if(l<3)D[s++]=i[y++]??-1;
else return D[--s]&255}})());
W(k+'/stdout.bin',U.subarray(0,L))}
