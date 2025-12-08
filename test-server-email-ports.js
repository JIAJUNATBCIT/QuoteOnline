#!/usr/bin/env node

const net = require('net');
const dns = require('dns');
const util = require('util');

const dnsLookup = util.promisify(dns.lookup);

async function testPortConnection(host, port, timeout = 5000) {
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

async function testDNSResolution(host) {
  try {
    const result = await dnsLookup(host);
    return { success: true, host, ip: result.address, family: result.family };
  } catch (error) {
    return { success: false, host, error: error.message };
  }
}

async function runServerEmailTest() {
  console.log('=== 服务器邮件端口连通性测试 ===');
  console.log(`测试时间: ${new Date().toISOString()}`);
  console.log(`测试主机: ${require('os').hostname()}`);
  console.log('');
  
  const emailHost = 'smtp.exmail.qq.com';
  const emailPorts = [465, 587, 25, 2525];
  
  // 1. 测试DNS解析
  console.log('1. DNS解析测试...');
  const dnsResult = await testDNSResolution(emailHost);
  if (dnsResult.success) {
    console.log(`✅ DNS解析成功: ${dnsResult.host} -> ${dnsResult.ip} (IPv${dnsResult.family})`);
  } else {
    console.log(`❌ DNS解析失败: ${dnsResult.host} - ${dnsResult.error}`);
    return;
  }
  
  // 2. 测试端口连通性
  console.log('\n2. 端口连通性测试...');
  const results = [];
  
  for (const port of emailPorts) {
    console.log(`测试 ${emailHost}:${port}...`);
    const result = await testPortConnection(emailHost, port, 10000);
    results.push(result);
    
    if (result.success) {
      console.log(`✅ ${emailHost}:${port} - 连接成功 (${result.duration}ms)`);
    } else {
      console.log(`❌ ${emailHost}:${port} - 连接失败 (${result.duration}ms) - ${result.error}`);
    }
  }
  
  // 3. 测试Telnet模拟
  console.log('\n3. 模拟SMTP连接测试...');
  for (const result of results) {
    if (result.success && (result.port === 465 || result.port === 587)) {
      console.log(`\n详细测试 ${emailHost}:${result.port}...`);
      await testSMTPHandshake(emailHost, result.port);
    }
  }
  
  // 4. 总结
  console.log('\n=== 测试总结 ===');
  const successfulPorts = results.filter(r => r.success).map(r => r.port);
  const failedPorts = results.filter(r => !r.success).map(r => r.port);
  
  if (successfulPorts.length > 0) {
    console.log(`✅ 可用端口: ${successfulPorts.join(', ')}`);
  } else {
    console.log('❌ 所有端口都不可用');
  }
  
  if (failedPorts.length > 0) {
    console.log(`❌ 不可用端口: ${failedPorts.join(', ')}`);
  }
  
  // 5. 建议解决方案
  console.log('\n=== 建议解决方案 ===');
  if (successfulPorts.length === 0) {
    console.log('🔧 所有邮件端口都无法连接，建议检查：');
    console.log('   1. 服务器防火墙是否阻止了出站连接');
    console.log('   2. 云服务商是否限制了邮件端口');
    console.log('   3. 网络配置是否正确');
    console.log('');
    console.log('🔧 常用解决方案：');
    console.log('   # Ubuntu/Debian 防火墙检查');
    console.log('   sudo ufw status');
    console.log('   sudo ufw allow out 465');
    console.log('   sudo ufw allow out 587');
    console.log('');
    console.log('   # CentOS/RHEL 防火墙检查');
    console.log('   sudo firewall-cmd --list-all');
    console.log('   sudo firewall-cmd --add-port=465/tcp --permanent');
    console.log('   sudo firewall-cmd --add-port=587/tcp --permanent');
    console.log('   sudo firewall-cmd --reload');
  } else {
    console.log('✅ 邮件端口连接正常，可能需要调整邮件服务配置');
  }
}

async function testSMTPHandshake(host, port) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let receivedData = '';
    
    socket.on('connect', () => {
      console.log('  🔗 TCP连接建立');
    });
    
    socket.on('data', (data) => {
      receivedData += data.toString();
      console.log('  📨 服务器响应:', data.toString().trim());
      
      if (receivedData.includes('220')) {
        socket.write('EHLO test.example.com\r\n');
      } else if (receivedData.includes('250') && !receivedData.includes('EHLO')) {
        socket.write('QUIT\r\n');
      } else if (receivedData.includes('221')) {
        socket.end();
      }
    });
    
    socket.on('end', () => {
      console.log('  🔚 连接关闭');
      resolve();
    });
    
    socket.on('error', (err) => {
      console.log('  ❌ 连接错误:', err.message);
      resolve();
    });
    
    socket.setTimeout(5000, () => {
      console.log('  ⏰ 握手超时');
      socket.destroy();
      resolve();
    });
    
    socket.connect(port, host);
  });
}

// 运行测试
runServerEmailTest().catch(console.error);