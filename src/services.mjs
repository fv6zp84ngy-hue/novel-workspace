const messages={
  'Session expired. Reconfigure services.':'本机会话已过期，请重新连接服务。',
  'Configure your own model account first':'请先连接自己的模型账户。',
  'At most 10 model calls per minute':'本会话一分钟最多调用模型 10 次，请稍后手动重试。',
  'Local session budget would be exceeded; review your provider budget first':'此次请求将超过本会话 token 上限。请先核对服务商预算，再调整上限。',
  'Another service request is running':'本机服务仍在处理上一项请求，请稍后重试。',
  'Remote snapshot changed. Download and review it before uploading.':'远端快照已变化，已停止覆盖。请重新读取并保留远端副本。',
  'Only a public HTTPS URL on port 443 is supported':'仅支持公开 HTTPS 地址和标准 443 端口。',
  'Private network endpoints are blocked':'不支持内网或 localhost 服务地址。',
  'Private or reserved network addresses are blocked':'此地址指向内网或保留网络，已阻止访问。',
  'Service connection failed or timed out':'服务连接失败或超时。请求可能已计费，不会自动重试。',
  'Redirect refused; use the final service URL':'服务发生跳转，请填写最终 HTTPS 地址后重试。',
  'This WebDAV server does not provide a strong ETag; safe overwrite is unavailable':'该网盘未提供安全覆盖所需的强 ETag，暂不支持此服务。',
  'Invalid API key':'密钥格式不正确，请重新输入。'
};
function serviceMessage(value,status){const message=value.error||'';if(messages[message])return messages[message];const code=message.match(/HTTP (\d+)/)?.[1];if(code)return `远端服务返回 HTTP ${code}。请检查账户权限、地址、模型 ID 和余额。`;return `服务请求未完成（HTTP ${status}），请检查配置和输入范围。`;}
export class Services {
  constructor(){this.token=null;this.config=null;this.budget=null;this.busy=false;}
  async request(path,data){
    if(location.hostname!=='127.0.0.1')throw Error('请用 Python 本机启动器打开 127.0.0.1 地址后连接服务。');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),55000);
    try{const response=await fetch(path,{method:'POST',headers:{'Content-Type':'application/json',...(this.token?{'X-Workspace-Session':this.token}:{})},body:JSON.stringify(data),signal:controller.signal,redirect:'error'});let value;try{value=await response.json();}catch{throw Error('本机服务未启动或版本过旧，请重启 Python 启动器');}if(!response.ok){const error=Error(serviceMessage(value,response.status));error.status=response.status;throw error;}if(value.local_budget)this.budget=value.local_budget;return value;}catch(error){if(error.name==='AbortError')throw Error('请求超时，服务商可能已计费；不会自动重试。');throw error;}finally{clearTimeout(timeout);}
  }
  async ready(){if(!this.token)this.token=(await this.request('/api/session',{})).token;}
  async configure(data){await this.ready();let result;try{result=await this.request('/api/config',data);}catch(error){if(error.status!==401)throw error;this.token=null;await this.ready();result=await this.request('/api/config',data);}this.config={base:data.base.replace(/\/$/,''),chatModel:data.chatModel,embeddingModel:data.embeddingModel};this.budget={spent:result.spent,limit:result.budget};return result;}
  async ai(data){await this.ready();return this.request('/api/ai',data);}
  async dav(data){await this.ready();return this.request('/api/dav',data);}
  async forget(){try{if(this.token)await this.request('/api/forget',{});}catch(error){if(error.status!==401)throw error;}finally{this.token=null;this.config=null;this.budget=null;}}
}
