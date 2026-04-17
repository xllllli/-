<script setup>
import { ref, reactive, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';

// 初始化 Markdown 解析器
const md = new MarkdownIt();
const chatBody = ref(null);

// 初始欢迎消息
const messages = ref([
  { role: 'assistant', content: '你好！我是智旅通 AI 助手，有什么可以帮您的？', thinking: false }
]);
const userInput = ref('');

/**
 * 自动滚动到底部
 */
const scrollToBottom = async () => {
  await nextTick();
  if (chatBody.value) {
    chatBody.value.scrollTop = chatBody.value.scrollHeight;
  }
};

/**
 * 打字机效果函数
 * @param {Object} messageObj - 响应式消息对象
 * @param {String} fullText - 后端返回的完整文本
 */
const typeEffect = (messageObj, fullText) => {
  if (!fullText) {
    messageObj.thinking = false;
    return;
  }

  let i = 0;
  messageObj.content = ""; // 清空初始内容
  messageObj.thinking = false; // 停止思考动画

  const timer = setInterval(() => {
    if (i < fullText.length) {
      // 逐个字符累加
      messageObj.content += fullText.charAt(i);
      i++;
      // 随打字进度滚动
      scrollToBottom();
    } else {
      // 打字结束，清除定时器
      clearInterval(timer);
    }
  }, 30); // 30ms 吐一个字，速度适中
};

/**
 * 发送消息并处理响应
 */
const sendMessage = async () => {
  if (!userInput.value) return;

  const currentPrompt = userInput.value;
  // 1. 添加用户消息
  messages.value.push({ role: 'user', content: currentPrompt });
  userInput.value = '';
  
  // 2. 添加 AI 占位消息，开启思考动画
  const assistantMsg = reactive({ 
    role: 'assistant', 
    content: '', 
    thinking: true 
  });
  messages.value.push(assistantMsg);
  await scrollToBottom();

  try {
    const response = await fetch('http://47.111.15.132:8000/chat', {
      method: 'POST',
      body: JSON.stringify({ prompt: currentPrompt }),
      headers: { 'Content-Type': 'application/json' }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();

    // 用于记录最后一次有效的 content，防止 done 包内容缺失
    let finalContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      lines.forEach(line => {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            
            // 实时记录最新内容（此时界面并不渲染，仍在转圈）
            if (data.content) {
              finalContent = data.content;
            }

            // 💡 只有当后端发送 status 为 done 时，才启动平滑打字效果
            if (data.status === "done") {
              // 这里的 finalContent 来源于上一个 processing 包或当前的 done 包
              const textToDisplay = data.content || finalContent;
              typeEffect(assistantMsg, textToDisplay);
            }
          } catch (e) {
            console.error("解析数据包失败:", e);
          }
        }
      });
    }
  } catch (e) {
    // 异常处理：关闭动画并报错
    assistantMsg.thinking = false;
    assistantMsg.content = "⚠️ 连接失败，请检查后端服务是否启动。";
    console.error("Fetch Error:", e);
  }
};
</script>
<template>
  <div class="app-container">
    <div class="bg-decoration top-left"></div>
    <div class="bg-decoration bottom-right"></div>
    
    <div class="inspiration-sidebar">
      <div class="section-title">
        <span class="icon">✨</span>
        <span>探索灵感</span>
      </div>
      <div class="tag-cloud">
        <div class="tag-card" @click="userInput = '推荐一个南昌适合看日落的地方'">🌅 南昌日落</div>
        <div class="tag-card" @click="userInput = '武功山两天一夜攻略'">⛰️ 武功山攻略</div>
        <div class="tag-card" @click="userInput = '景德镇御窑厂怎么玩？'">🏺 景德镇陶瓷</div>
        <div class="tag-card" @click="userInput = '婺源现在油菜花开了吗？'">🌼 婺源花海</div>
        <div class="tag-card" @click="userInput = '江西有哪些不累的避暑胜地？'">🍃 避暑不累</div>
      </div>
    </div>

    <div class="chat-window">
      <header class="header">
        <div class="header-info">
          <span class="status-dot"></span>
          <div class="title-group">
            <strong class="main-title">智旅通 · 江西金牌向导</strong>
            <span class="sub-title">基于实时气象与 RAG 的行程规划</span>
          </div>
        </div>
      </header>

      <main class="main-scroll" ref="chatBody">
        <div v-for="(msg, i) in messages" :key="i" :class="['message-row', msg.role]">
          <div v-if="msg.role === 'assistant'" class="avatar assistant-avatar">🤖</div>
          <div class="bubble-container">
            <div class="bubble">
              <div v-if="msg.role === 'assistant' && msg.thinking" class="thinking-bubble">
                <span>正在为您规划行程</span>
                <div class="dot-ani"></div><div class="dot-ani"></div><div class="dot-ani"></div>
              </div>
              <div v-else v-html="md.render(msg.content)"></div>
            </div>
          </div>
          <div v-if="msg.role === 'user'" class="avatar user-avatar">👤</div>
        </div>
      </main>

      <footer class="footer">
        <div class="input-wrapper">
          <input v-model="userInput" @keyup.enter="sendMessage" placeholder="输入目的地，开启江西之旅..." />
          <button class="send-btn" @click="sendMessage" :disabled="!userInput">发送</button>
        </div>
      </footer>
    </div>
  </div>
</template>
<style scoped>
/* 1. 顶层容器：确保背景色和渐变全屏铺满，锁定视口 */
.app-container {
  position: fixed;
  top: 0;
  left: 0;
  width: 100vw;
  height: 100vh;
  /* 江西山水意境的天青色渐变 */
  background: #f0f4f8 linear-gradient(135deg, #eef2f3 0%, #8e9eab 100%);
  display: flex;
  justify-content: center;
  align-items: center;
  margin: 0;
  padding: 0;
  overflow: hidden;
  font-family: "PingFang SC", "Helvetica Neue", Helvetica, Arial, sans-serif;
}

/* 2. 背景装饰球：使用 pointer-events: none 确保不阻挡点击操作 */
.bg-decoration {
  position: absolute;
  border-radius: 50%;
  filter: blur(80px);
  opacity: 0.3;
  z-index: 0;
  pointer-events: none; /* 允许点击穿透到下层按钮 */
}
.top-left { width: 400px; height: 400px; background: #1890ff; top: -10%; left: -5%; }
.bottom-right { width: 500px; height: 500px; background: #52c41a; bottom: -10%; right: -5%; }

/* 3. 左侧灵感探索区 */
.inspiration-sidebar {
  position: absolute;
  left: 40px;
  top: 20%;
  width: 200px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 15px;
}

/* 窄屏适配：屏幕宽度小于 1150px 时隐藏侧边栏，保证对话框居中 */
@media (max-width: 1150px) {
  .inspiration-sidebar { display: none; }
}

.section-title {
  display: flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: #2c3e50;
  font-size: 16px;
  margin-bottom: 5px;
}

.tag-cloud {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tag-card {
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(10px);
  padding: 12px 16px;
  border-radius: 12px;
  font-size: 14px;
  color: #555;
  cursor: pointer;
  border: 1px solid rgba(255, 255, 255, 0.5);
  box-shadow: 0 4px 6px rgba(0,0,0,0.02);
  transition: all 0.3s ease;
}

.tag-card:hover {
  background: #fff;
  transform: translateX(10px);
  color: #1890ff;
  border-color: #1890ff;
  box-shadow: 0 8px 15px rgba(24, 144, 255, 0.1);
}

/* 4. 聊天主窗口：玻璃拟态效果 */
.chat-window {
  position: relative;
  width: 90%;
  max-width: 850px;
  height: 85vh;
  background: rgba(255, 255, 255, 0.96);
  backdrop-filter: blur(20px);
  display: flex;
  flex-direction: column;
  border-radius: 24px;
  box-shadow: 0 20px 60px rgba(0,0,0,0.12);
  z-index: 20;
  overflow: hidden;
  border: 1px solid rgba(255, 255, 255, 0.4);
}

/* 顶部标题栏 */
.header {
  height: 70px;
  padding: 0 25px;
  background: #fff;
  border-bottom: 1px solid #f0f0f0;
  display: flex;
  align-items: center;
  flex-shrink: 0;
}
.header-info { display: flex; align-items: center; gap: 12px; }
.status-dot { width: 10px; height: 10px; background: #52c41a; border-radius: 50%; box-shadow: 0 0 8px #52c41a; }
.title-group { display: flex; flex-direction: column; }
.main-title { font-size: 17px; color: #333; font-weight: 600; }
.sub-title { font-size: 12px; color: #999; }

/* 5. 消息列表区域 */
.main-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 25px;
  background: rgba(249, 251, 255, 0.5);
  scroll-behavior: smooth;
}

/* 消息行布局：确保头像与气泡水平排列 */
.message-row {
  display: flex;
  margin-bottom: 20px;
  align-items: flex-start; /* 顶部对齐 */
  animation: fadeIn 0.4s ease;
}
@keyframes fadeIn { from { opacity: 0; transform: translateY(5px); } to { opacity: 1; transform: translateY(0); } }

.message-row.user { justify-content: flex-end; }
.message-row.assistant { justify-content: flex-start; }

/* 头像样式 */
.avatar {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  justify-content: center;
  align-items: center;
  font-size: 20px;
  flex-shrink: 0;
}
.assistant-avatar { background: #e6f7ff; margin-right: 12px; }
.user-avatar { background: #f0f0f0; margin-left: 12px; }

/* 气泡样式 */
.bubble-container { max-width: 75%; }
.bubble {
  padding: 12px 18px;
  border-radius: 16px;
  font-size: 15px;
  line-height: 1.6;
  word-wrap: break-word;
}
.assistant .bubble {
  background: #fff;
  border: 1px solid #ebedf0;
  color: #333;
  border-top-left-radius: 4px;
}
.user .bubble {
  background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%);
  color: #fff;
  border-top-right-radius: 4px;
  box-shadow: 0 4px 12px rgba(24, 144, 255, 0.2);
}

/* 6. 思考中动画 */
.thinking-bubble { display: flex; align-items: center; gap: 6px; color: #1890ff; font-weight: 500; }
.dot-ani { width: 6px; height: 6px; background: #1890ff; border-radius: 50%; animation: dotFlash 1.4s infinite; }
.dot-ani:nth-child(2) { animation-delay: 0.2s; }
.dot-ani:nth-child(3) { animation-delay: 0.4s; }

@keyframes dotFlash { 0%, 100% { opacity: 0.2; } 50% { opacity: 1; } }

/* 7. 底部输入区域 */
.footer {
  padding: 20px 25px;
  background: #fff;
  border-top: 1px solid #f0f0f0;
}
.input-wrapper {
  display: flex;
  background: #f4f5f7;
  padding: 8px 8px 8px 20px;
  border-radius: 30px;
  align-items: center;
  transition: all 0.3s;
}
.input-wrapper:focus-within {
  background: #fff;
  box-shadow: 0 0 0 2px #1890ff;
}
input {
  flex: 1;
  background: transparent;
  border: none;
  outline: none;
  font-size: 15px;
  color: #333;
}
.send-btn {
  background: #1890ff;
  color: #fff;
  border: none;
  height: 40px;
  padding: 0 22px;
  border-radius: 20px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}
.send-btn:hover { background: #40a9ff; transform: scale(1.05); }
.send-btn:disabled { background: #bfbfbf; transform: none; cursor: not-allowed; }

/* 滚动条美化 */
.main-scroll::-webkit-scrollbar { width: 6px; }
.main-scroll::-webkit-scrollbar-thumb { background: #e0e0e0; border-radius: 10px; }
.main-scroll::-webkit-scrollbar-track { background: transparent; }
</style>