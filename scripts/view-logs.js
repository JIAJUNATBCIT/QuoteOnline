const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, '../logs');

// 显示帮助信息
function showHelp() {
  console.log(`
使用方法:
  node view-logs.js [选项] [日期]

选项:
  --error, -e    只显示错误日志
  --tail, -t     实时监控日志文件
  --help, -h     显示帮助信息

日期格式:
  YYYY-MM-DD     指定日期的日志 (默认: 今天)

示例:
  node view-logs.js                    # 查看今天的所有日志
  node view-logs.js --error            # 查看今天的错误日志
  node view-logs.js 2025-11-17         # 查看指定日期的日志
  node view-logs.js --tail             # 实时监控今天的日志
  `);
}

// 获取日志文件路径
function getLogFilePath(date, isErrorOnly = false) {
  if (isErrorOnly) {
    return path.join(logDir, 'error.log');
  }
  return path.join(logDir, `${date}.log`);
}

// 读取并显示日志
function showLogs(date, isErrorOnly = false) {
  const logFile = getLogFilePath(date, isErrorOnly);
  
  if (!fs.existsSync(logFile)) {
    console.log(`日志文件不存在: ${logFile}`);
    return;
  }
  
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    console.log(`\n=== ${isErrorOnly ? '错误' : date} 日志 ===\n`);
    console.log(content);
  } catch (error) {
    console.error('读取日志文件失败:', error.message);
  }
}

// 实时监控日志
function tailLogs(date, isErrorOnly = false) {
  const logFile = getLogFilePath(date, isErrorOnly);
  
  if (!fs.existsSync(logFile)) {
    console.log(`日志文件不存在: ${logFile}`);
    return;
  }
  
  console.log(`\n=== 实时监控 ${isErrorOnly ? '错误' : date} 日志 (Ctrl+C 退出) ===\n`);
  
  // 显示现有内容
  try {
    const content = fs.readFileSync(logFile, 'utf8');
    const lines = content.split('\n');
    if (lines.length > 20) {
      console.log(lines.slice(-20).join('\n')); // 显示最后20行
    } else {
      console.log(content);
    }
  } catch (error) {
    console.error('读取日志文件失败:', error.message);
  }
  
  // 监控文件变化
  fs.watchFile(logFile, (curr, prev) => {
    if (curr.size > prev.size) {
      try {
        const newContent = fs.readFileSync(logFile, 'utf8');
        const lines = newContent.split('\n');
        const newLines = lines.slice(prev.size.toString().length);
        if (newLines.length > 0) {
          console.log(newLines.join('\n'));
        }
      } catch (error) {
        console.error('读取新日志内容失败:', error.message);
      }
    }
  });
}

// 解析命令行参数
function parseArgs() {
  const args = process.argv.slice(2);
  const options = {
    date: new Date().toISOString().split('T')[0], // 默认今天
    errorOnly: false,
    tail: false,
    help: false
  };
  
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--error' || arg === '-e') {
      options.errorOnly = true;
    } else if (arg === '--tail' || arg === '-t') {
      options.tail = true;
    } else if (!arg.startsWith('-')) {
      // 假设是日期参数
      options.date = arg;
    }
  }
  
  return options;
}

// 主函数
function main() {
  const options = parseArgs();
  
  if (options.help) {
    showHelp();
    return;
  }
  
  if (options.tail) {
    tailLogs(options.date, options.errorOnly);
  } else {
    showLogs(options.date, options.errorOnly);
  }
}

// 处理 Ctrl+C 退出
process.on('SIGINT', () => {
  console.log('\n\n停止监控日志...');
  process.exit(0);
});

main();