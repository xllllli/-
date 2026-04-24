<script setup>
import { ref, reactive, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';

// 初始化 Markdown 解析器
const md = new MarkdownIt();
const chatBody = ref(null);

// 初始欢迎消息
const messages = ref([
  { role: 'assistant', content: '你好！我是智旅通 AI 助手，有什么可以帮您的？', thinking: false, uiData: null }
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
 * 解析消息内容，分离文本和 JSON UI
 */
const parseMessageContent = (messageObj) => {
  const fullText = messageObj.content;
  // 匹配标记位之间的 JSON
  const regex = /---JSON_UI_BEGIN---([\s\S]*?)---JSON_UI_END---/g;
  
  let match;
  const cards = [];
  
  // 1. 提取所有 JSON 块
  while ((match = regex.exec(fullText)) !== null) {
    try {
      cards.push(JSON.parse(match[1].trim()));
    } catch (e) {
      console.error("卡片 JSON 解析失败:", e);
    }
  }

  // 2. 将 UI 数据存入消息对象
  if (cards.length > 0) {
    messageObj.uiData = cards;
  }

  // 3. 核心步骤：移除掉原文中的 JSON 标记块，只留下纯文字给 Markdown 解析器
  messageObj.content = fullText.replace(regex, '').trim();
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
  messageObj.uiData = null; // 初始化 UI 数据位

  const timer = setInterval(() => {
    if (i < fullText.length) {
      messageObj.content += fullText.charAt(i);
      i++;
      scrollToBottom();
    } else {
      clearInterval(timer);
      // 打字结束后执行解析，分离 JSON 并清理 content
      parseMessageContent(messageObj);
      scrollToBottom();
    }
  }, 30); 
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
  
  // 2. 添加 AI 占位消息，显式初始化 uiData 确保响应式
  const assistantMsg = reactive({ 
    role: 'assistant', 
    content: '', 
    thinking: true,
    uiData: null 
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
            if (data.content) {
              finalContent = data.content;
            }
            if (data.status === "done") {
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
              
              <div v-else class="markdown-body" v-html="md.render(msg.content)"></div>

              <div v-if="msg.uiData && msg.uiData.length > 0" class="ui-cards-wrapper">
                <div v-for="(card, index) in msg.uiData" :key="index" class="card-item">
                  <div v-if="card.type === 'scenery-card'" class="scenery-card">
                    <div class="card-image">
                      <img :src="card.data.image" alt="风景图" @load="scrollToBottom" />
                    </div>
                    <div class="card-body">
                      <h4 class="card-name">{{ card.data.name }}</h4>
                      <div class="card-tags">
                        <span v-for="tag in card.data.tags" :key="tag" class="tag-item">{{ tag }}</span>
                      </div>
                      <p class="card-desc">{{ card.data.desc }}</p>
                    </div>
                  </div>
                </div>
              </div>
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
              <pre v-if="msg.role === 'assistant'" style="color: #ff4d4f; font-size: 11px; background: #f5f5f5; padding: 8px; border-radius: 4px; margin-top: 10px; overflow: auto;">
      Debug 数据状态: {{ msg.uiData }}
    </pre>
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

/* 平板设备 (768px - 1024px) */
@media (max-width: 1024px) {
  .chat-window {
    width: 95%;
    height: 90vh;
  }
  
  .bubble-container {
    max-width: 85%;
  }
  
  .inspiration-sidebar {
    left: 20px;
    width: 180px;
  }
 
}

/* 手机设备 (小于 768px) */
@media (max-width: 768px) {
  .chat-window {
    width: 100%;
    height: 100vh;
    border-radius: 0;
  }
  
  .header {
    height: 60px;
    padding: 0 16px;
  }
  
  .main-title {
    font-size: 15px;
  }
  
  .sub-title {
    font-size: 10px;
  }
  
  .main-scroll {
    padding: 16px;
  }
  
  .avatar {
    width: 32px;
    height: 32px;
    font-size: 16px;
  }
  
  .bubble {
    padding: 8px 12px;
    font-size: 14px;
  }
  
  .bubble-container {
    max-width: 90%;
  }
  
  .footer {
    padding: 12px 16px;
  }
  
  .input-wrapper {
    padding: 4px 4px 4px 16px;
  }
  
  input {
    font-size: 12px;
  }
  
  .send-btn {
    height: 36px;
    padding: 0 16px;
    font-size: 14px;
  }
  
  .tag-card {
    padding: 8px 12px;
    font-size: 12px;
  }
}

/* 超小手机 (小于 480px) */
@media (max-width: 480px) {
  .bubble-container {
    max-width: 95%;
  }
  
  .message-row {
    margin-bottom: 12px;
  }
  
  .avatar {
    width: 28px;
    height: 28px;
    font-size: 14px;
  }
  
  .bubble {
    padding: 6px 10px;
    font-size: 13px;
  }
  
  .tag-card {
    padding: 6px 10px;
    font-size: 11px;
  }
  input {
    font-size: 11px;  /* 从 14px 改为 12px */
  }
}

/* 卡片容器外间距：与 Markdown 文字拉开距离 */
.ui-cards-wrapper {
  margin-top: 14px;
  display: flex;
  flex-direction: column;
  gap: 15px;
  /* 卡片进入时的渐显动画 */
  animation: cardSlideUp 0.5s cubic-bezier(0.25, 0.46, 0.45, 0.94) both;
}

@keyframes cardSlideUp {
  from { opacity: 0; transform: translateY(15px); }
  to { opacity: 1; transform: translateY(0); }
}

/* 风景卡片主体 */
.scenery-card {
  background: #ffffff;
  border-radius: 18px;
  overflow: hidden;
  box-shadow: 0 10px 25px rgba(0, 0, 0, 0.05);
  border: 1px solid rgba(0, 0, 0, 0.04);
  max-width: 100%;
  transition: all 0.3s ease;
}

.scenery-card:hover {
  transform: translateY(-4px);
  box-shadow: 0 15px 35px rgba(24, 144, 255, 0.1);
}

/* 图片区域 */
.card-image {
  width: 100%;
  height: 190px;
  overflow: hidden;
  background: #f0f2f5;
  position: relative;
}

.card-image img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.5s ease;
}

.scenery-card:hover .card-image img {
  transform: scale(1.08); /* 悬停时图片轻微放大，增加生动感 */
}

/* 卡片内容文字区 */
.card-body {
  padding: 16px;
  text-align: left;
}

.card-name {
  margin: 0 0 10px 0;
  font-size: 18px;
  font-weight: 600;
  color: #262626;
  letter-spacing: 0.5px;
}

/* 标签组 */
.card-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 12px;
}

.tag-item {
  background: #e6f7ff;
  color: #1890ff;
  font-size: 12px;
  padding: 4px 10px;
  border-radius: 6px;
  font-weight: 500;
  border: 1px solid #bae7ff;
}

/* 描述文本 */
.card-desc {
  font-size: 14px;
  color: #595959;
  line-height: 1.6;
  margin: 0;
}

/* 适配手机端：缩小卡片图片高度 */
@media (max-width: 768px) {
  .card-image {
    height: 150px;
  }
  .card-name {
    font-size: 16px;
  }
  .card-desc {
    font-size: 13px;
  }
}

/* 修正 Markdown 内容的行间距，避免与卡片太近 */
.markdown-content :last-child {
  margin-bottom: 0;
}
.app-container {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: #f0f4f8 linear-gradient(135deg, #eef2f3 0%, #8e9eab 100%);
  display: flex; justify-content: center; align-items: center; overflow: hidden;
  font-family: "PingFang SC", sans-serif;
}
.bg-decoration { position: absolute; border-radius: 50%; filter: blur(80px); opacity: 0.3; pointer-events: none; }
.top-left { width: 400px; height: 400px; background: #1890ff; top: -10%; left: -5%; }
.bottom-right { width: 500px; height: 500px; background: #52c41a; bottom: -10%; right: -5%; }

.inspiration-sidebar { position: absolute; left: 40px; top: 20%; width: 200px; z-index: 10; display: flex; flex-direction: column; gap: 15px; }
@media (max-width: 1150px) { .inspiration-sidebar { display: none; } }

.tag-card { background: rgba(255, 255, 255, 0.8); backdrop-filter: blur(10px); padding: 12px 16px; border-radius: 12px; cursor: pointer; transition: all 0.3s ease; border: 1px solid rgba(255, 255, 255, 0.5); }
.tag-card:hover { transform: translateX(10px); color: #1890ff; border-color: #1890ff; }

.chat-window { position: relative; width: 90%; max-width: 850px; height: 85vh; background: rgba(255, 255, 255, 0.96); border-radius: 24px; display: flex; flex-direction: column; overflow: hidden; box-shadow: 0 20px 60px rgba(0,0,0,0.12); }
.header { height: 70px; padding: 0 25px; border-bottom: 1px solid #f0f0f0; display: flex; align-items: center; }
.status-dot { width: 10px; height: 10px; background: #52c41a; border-radius: 50%; }

.main-scroll { flex: 1; overflow-y: auto; padding: 25px; background: rgba(249, 251, 255, 0.5); }
.message-row { display: flex; margin-bottom: 20px; animation: fadeIn 0.4s ease; }
.message-row.user { justify-content: flex-end; }
.bubble { padding: 12px 18px; border-radius: 16px; font-size: 15px; line-height: 1.6; max-width: 100%; }
.assistant .bubble { background: #fff; border: 1px solid #ebedf0; border-top-left-radius: 4px; }
.user .bubble { background: linear-gradient(135deg, #1890ff 0%, #096dd9 100%); color: #fff; border-top-right-radius: 4px; }

.avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; justify-content: center; align-items: center; font-size: 20px; }
.assistant-avatar { background: #e6f7ff; margin-right: 12px; }
.user-avatar { background: #f0f0f0; margin-left: 12px; }

.footer { padding: 20px 25px; border-top: 1px solid #f0f0f0; }
.input-wrapper { display: flex; background: #f4f5f7; padding: 8px 20px; border-radius: 30px; align-items: center; }
input { flex: 1; border: none; background: transparent; outline: none; }
.send-btn { background: #1890ff; color: #fff; border: none; padding: 10px 22px; border-radius: 20px; cursor: pointer; }

/* 💡 新增卡片样式 */
.ui-cards-wrapper { margin-top: 14px; display: flex; flex-direction: column; gap: 15px; animation: cardSlideUp 0.5s ease; }
@keyframes cardSlideUp { from { opacity: 0; transform: translateY(15px); } to { opacity: 1; transform: translateY(0); } }

.scenery-card { background: #fff; border-radius: 18px; overflow: hidden; border: 1px solid #f0f0f0; box-shadow: 0 10px 25px rgba(0,0,0,0.05); }
.card-image { width: 100%; height: 190px; }
.card-image img { width: 100%; height: 100%; object-fit: cover; }
.card-body { padding: 16px; text-align: left; }
.card-name { margin-bottom: 8px; font-size: 18px; color: #262626; }
.card-tags { display: flex; gap: 8px; margin-bottom: 10px; }
.tag-item { background: #e6f7ff; color: #1890ff; font-size: 12px; padding: 4px 10px; border-radius: 6px; }
.card-desc { font-size: 14px; color: #595959; }

@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
</style>