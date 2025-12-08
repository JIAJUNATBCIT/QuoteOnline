#!/usr/bin/env node

const net = require('net');
const dns = require('dns');
const util = require('util');
const { execSync } = require('child_process');

const dnsLookup = util.promisify(dns.lookup);

async function testBasicConnectivity() {
  console.log('=== 基础网络连通性测试 ===');
  
  try {
    // 测试DNS解析
    console.log('1. 测试DNS解析...');
    const dnsResult = await dnsLookup('smtp.exmail.qq.com');
    console.log(`✅ smtp.exmail.qq.com 解析为: ${dnsResult.address}`);
    
    // 测试基础网络连通性
    console.log('\n2. 测试基础网络连通性...');
    try {
      execSync('ping -c 3 smtp.exmail.qq.com', { stdio: 'pipe' });
      console.log('✅ ping 测试成功');
    } catch (error) {
      console.log('❌ ping 测试失败');
    }
    
    // 测试traceroute
    console.log('\n3. 测试网络路由...');
    try {
      const traceroute = execSync('traceroute -n smtp.exmail.qq.com', { encoding: 'utf8', timeout: 10000 });
      console.log('✅ traceroute 成功:');
      console.log(traceroute.split('\n').slice(0, 5).join('\n') + '...');
    } catch (error) {
      console.log('❌ traceroute 失败');
    }
    
  } catch (error) {
    console.log('❌ 基础网络测试失败:', error.message);
  }
}

async function testDifferentEmailServers() {
  console.log('\n=== 测试其他邮件服务器 ===');
  
  const emailServers = [
    { host: 'smtp.gmail.com', ports: [465, 587], name: 'Gmail' },
    { host: 'smtp.outlook.com', ports: [587], name: 'Outlook' },
    { host: 'smtp.mail.yahoo.com', ports: [465, 587], name: 'Yahoo' },
    { host: 'smtp.zoho.com', ports: [465, 587], name: 'Zoho' }
  ];
  
  for (const server of emailServers) {
    console.log(`\n测试 ${server.name} (${server.host})...`);
    
    try {
      const dnsResult = await dnsLookup(server.host);
      console.log(`  DNS: ${dnsResult.address}`);
      
      for (const port of server.ports) {
        const result = await testPortConnection(server.host, port, 5000);
        if (result.success) {
          console.log(`  ✅ ${port}端口连接成功 (${result.duration}ms)`);
        } else {
          console.log(`  ❌ ${port}端口连接失败: ${result.error}`);
        }
      }
    } catch (error) {
      console.log(`  ❌ ${server.name} 测试失败: ${error.message}`);
    }
  }
}

function testPortConnection(host, port, timeout = 5000) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const socket = new net.Socket();
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      socket.destroy();
      resolve({ success: true, port, host, duration, error: null });
    });
    
    socket.on('timeout', () => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      socket.destroy();
      resolve({ success: false, port, host, duration, error: 'Connection timeout' });
    });
    
    socket.on('error', (err) => {
      const endTime = Date.now();
      const duration = endTime - startTime;
      socket.destroy();
      resolve({ success: false, port, host, duration, error: err.message });
    });
    
    socket.connect(port, host);
  });
}

async function testSystemInfo() {
  console.log('\n=== 系统信息 ===');
  
  try {
    // 系统信息
    const os = require('os');
    console.log(`主机名: ${os.hostname()}`);
    console.log(`系统: ${os.type()} ${os.release()}`);
    console.log(`架构: ${os.arch()}`);
    
    // 网络接口
    console.log('\n网络接口:');
    const networkInterfaces = os.networkInterfaces();
    for (const [name, addresses] of Object.entries(networkInterfaces)) {
      for (const addr of addresses) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(`  ${name}: ${addr.address}`);
        }
      }
    }
    
    // 防火墙状态
    console.log('\n防火墙状态:');
    try {
      const ufwStatus = execSync('sudo ufw status', { encoding: 'utf8' });
      console.log(ufwStatus);
    } catch (error) {
      console.log('无法获取UFW状态');
    }
    
    // 检查进程监听
    console.log('\n检查是否有代理或VPN:');
    try {
      const netstat = execSync('netstat -tulpn | grep :465', { encoding: 'utf8' });
      console.log('465端口监听:', netstat || '无');
    } catch (error) {
      console.log('465端口无监听进程');
    }
    
  } catch (error) {
    console.log('系统信息获取失败:', error.message);
  }
}

async function testDNSServers() {
  console.log('\n=== DNS服务器测试 ===');
  
  const dnsServers = ['8.8.8.8', '1.1.1.1', '208.67.222.222'];
  
  for (const dns of dnsServers) {
    console.log(`测试DNS服务器 ${dns}...`);
    try {
      const dnsResolve = util.promisify(dns.resolve);
      await dnsResolve('smtp.exmail.qq.com', 'A', { servers: [dns] });
      console.log(`  ✅ DNS解析成功`);
    } catch (error) {
      console.log(`  ❌ DNS解析失败: ${error.message}`);
    }
  }
}

async function main() {
  console.log('深度网络诊断工具');
  console.log('==================');
  
  await testBasicConnectivity();
  await testDifferentEmailServers();
  await testSystemInfo();
  await testDNSServers();
  
  console.log('\n=== 诊断结论 ===');
  console.log('如果所有邮件服务器都无法连接，可能的原因:');
  console.log('1. ISP阻止了SMTP端口');
  console.log('2. 云服务商的网络策略限制');
  console.log('3. 系统级防火墙或安全组规则');
  console.log('4. 网络配置问题');
  
  console.log('\n建议的解决方案:');
  console.log('1. 使用第三方邮件服务API (SendGrid, Mailgun等)');
  console.log('2. 配置HTTP邮件转发代理');
  console.log('3. 联系云服务商支持');
}

main().catch(console.error);