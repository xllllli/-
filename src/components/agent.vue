<script setup>
import { ref, reactive, nextTick } from 'vue';
import MarkdownIt from 'markdown-it';

// 初始化 Markdown 解析器
const md = new MarkdownIt();
const chatBody = ref(null);

// 初始消息列表
const messages = ref([
  { 
    role: 'assistant', 
    content: '你好！我是智旅通 AI 助手，您的江西之旅金牌向导。我已经准备好为您提供基于实时天气和知识库的避雷建议了，请问您想去哪？', 
    thinking: false, 
    uiData: null 
  }
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
 * 解析消息内容：分离文本和 JSON UI 卡片
 */
const parseMessageContent = (messageObj) => {
  const fullText = messageObj.content;
  // 匹配标记位之间的内容
  const regex = /---JSON_UI_BEGIN---([\s\S]*?)---JSON_UI_END---/g;
  
  let match;
  const cards = [];
  
  while ((match = regex.exec(fullText)) !== null) {
    try {
      // 过滤掉模型可能误加的 Markdown 代码块标签
      let jsonStr = match[1].trim();
      jsonStr = jsonStr.replace(/```json|```/g, '').trim();
      cards.push(JSON.parse(jsonStr));
    } catch (e) {
      console.error("卡片数据解析失败:", e);
    }
  }

  // 如果解析到了卡片数据
  if (cards.length > 0) {
    messageObj.uiData = cards; // 存入消息对象的 uiData 字段
    // 重要：将原始文本中的 JSON 标记块剔除，防止界面显示乱码
    messageObj.content = fullText.replace(regex, '').trim();
  }
};

/**
 * 打字机效果逻辑
 */
const typeEffect = (messageObj, fullText) => {
  if (!fullText) {
    messageObj.thinking = false;
    return;
  }

  let i = 0;
  messageObj.content = ""; 
  messageObj.thinking = false; 

  const timer = setInterval(() => {
    if (i < fullText.length) {
      messageObj.content += fullText.charAt(i);
      i++;
      scrollToBottom();
    } else {
      clearInterval(timer);
      // 打字完成，执行解析逻辑，将 content 中的 JSON 转化为 uiData
      parseMessageContent(messageObj);
      scrollToBottom();
    }
  }, 25); 
};

/**
 * 发送请求
 */
const sendMessage = async () => {
  if (!userInput.value.trim()) return;

  const userText = userInput.value;
  messages.value.push({ role: 'user', content: userText });
  userInput.value = '';
  
  // 创建 AI 占位消息，显式包含 uiData 确保响应式
  const assistantMsg = reactive({ 
    role: 'assistant', 
    content: '', 
    thinking: true,
    uiData: null 
  });
  messages.value.push(assistantMsg);
  await scrollToBottom();

  try {
    const response = await fetch('[http://47.111.15.132:8000/chat](http://47.111.15.132:8000/chat)', {
      method: 'POST',
      body: JSON.stringify({ prompt: userText }),
      headers: { 'Content-Type': 'application/json' }
    });

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let accumulatedContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      const chunk = decoder.decode(value);
      const lines = chunk.split('\n');
      
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          try {
            const data = JSON.parse(line.slice(6));
            if (data.content) {
              accumulatedContent = data.content; 
            }
            if (data.status === "done") {
              // 最终流结束，启动打字机
              typeEffect(assistantMsg, accumulatedContent);
            }
          } catch (e) {
            console.warn("解析数据行出错", e);
          }
        }
      }
    }
  } catch (e) {
    assistantMsg.thinking = false;
    assistantMsg.content = "⚠️ 连接后端失败。请检查服务器地址是否正确，或浏览器是否拦截了不安全内容。";
  }
};
</script>

<template>
  <div class="app-container">
    <div class="bg-decoration top-left"></div>
    <div class="bg-decoration bottom-right"></div>
    
    <div class="sidebar">
      <div class="section-title">✨ 探索灵感</div>
      <div class="tag-list">
        <div class="tag-card" @click="userInput = '推荐一个适合看日落的地方'">🌅 南昌日落</div>
        <div class="tag-card" @click="userInput = '这周六去武功山天气合适吗？'">⛰️ 武功山气象</div>
        <div class="tag-card" @click="userInput = '景德镇有哪些避雷的陶瓷店？'">🏺 陶瓷避雷</div>
      </div>
    </div>

    <div class="chat-window">
      <header class="chat-header">
        <div class="header-status">
          <span class="online-dot"></span>
          <div>
            <div class="main-title">智旅通 · 江西 Agent</div>
            <div class="sub-title">实时物候与加权决策引擎已就绪</div>
          </div>
        </div>
      </header>

      <main class="chat-body" ref="chatBody">
        <div v-for="(msg, i) in messages" :key="i" :class="['msg-row', msg.role]">
          <div v-if="msg.role === 'assistant'" class="avatar">🤖</div>
          
          <div class="bubble-wrapper">
            <div class="bubble">
              <div v-if="msg.role === 'assistant' && msg.thinking" class="thinking-state">
                <span>行程规划中</span>
                <div class="dots"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>
              </div>
              
              <div v-else class="markdown-body" v-html="md.render(msg.content)"></div>

              <div v-if="msg.uiData && msg.uiData.length > 0" class="ui-container">
                <div v-for="(card, idx) in msg.uiData" :key="idx" class="scenery-card">
                  <div class="card-img-box">
                    <img :src="card.data.image" @load="scrollToBottom" alt="景点图" />
                  </div>
                  <div class="card-info">
                    <h4 class="card-title">{{ card.data.name }}</h4>
                    <div class="card-tags">
                      <span v-for="tag in card.data.tags" :key="tag" class="tag">{{ tag }}</span>
                    </div>
                    <p class="card-desc">{{ card.data.desc }}</p>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div v-if="msg.role === 'user'" class="avatar">👤</div>
        </div>
      </main>

      <footer class="chat-footer">
        <div class="input-area">
          <input 
            v-model="userInput" 
            @keyup.enter="sendMessage" 
            placeholder="问问周日去哪里玩比较好？" 
          />
          <button @click="sendMessage" :disabled="!userInput.trim()">发送</button>
        </div>
      </footer>
    </div>
  </div>
</template>

<style scoped>
/* 基础布局 */
.app-container {
  position: fixed; top: 0; left: 0; width: 100vw; height: 100vh;
  background: #f4f7f9; display: flex; justify-content: center; align-items: center;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
}
.bg-decoration { position: absolute; border-radius: 50%; filter: blur(100px); opacity: 0.25; z-index: 0; }
.top-left { width: 400px; height: 400px; background: #007bff; top: -10%; left: -5%; }
.bottom-right { width: 500px; height: 500px; background: #28a745; bottom: -10%; right: -5%; }

/* 聊天窗口 */
.chat-window {
  position: relative; z-index: 10; width: 90%; max-width: 880px; height: 85vh;
  background: rgba(255, 255, 255, 0.98); border-radius: 24px;
  display: flex; flex-direction: column; box-shadow: 0 30px 80px rgba(0,0,0,0.1); overflow: hidden;
}

/* 头部样式 */
.chat-header { height: 75px; padding: 0 30px; border-bottom: 1px solid #eee; display: flex; align-items: center; }
.header-status { display: flex; align-items: center; gap: 12px; }
.online-dot { width: 10px; height: 10px; background: #52c41a; border-radius: 50%; box-shadow: 0 0 8px #52c41a; }
.main-title { font-size: 18px; font-weight: 600; color: #333; }
.sub-title { font-size: 12px; color: #999; }

/* 聊天区域 */
.chat-body { flex: 1; overflow-y: auto; padding: 30px; background: #fcfdfe; }
.msg-row { display: flex; gap: 15px; margin-bottom: 25px; }
.msg-row.user { justify-content: flex-end; }

.bubble { 
  padding: 14px 20px; border-radius: 18px; max-width: 100%; font-size: 15px; line-height: 1.6;
  box-shadow: 0 2px 8px rgba(0,0,0,0.02);
}
.assistant .bubble { background: #fff; border: 1px solid #f0f0f0; border-top-left-radius: 4px; }
.user .bubble { background: #007bff; color: #fff; border-top-right-radius: 4px; }

.avatar { width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: #eee; font-size: 20px; }

/* 💡 卡片组件样式 */
.ui-container { margin-top: 15px; animation: fadeInUp 0.5s ease both; }
.scenery-card { 
  background: #fff; border-radius: 16px; overflow: hidden; 
  border: 1px solid #f0f0f0; box-shadow: 0 10px 30px rgba(0,0,0,0.05);
}
.card-img-box { width: 100%; height: 200px; background: #f8f9fa; }
.card-img-box img { width: 100%; height: 100%; object-fit: cover; transition: 0.3s; }
.scenery-card:hover img { transform: scale(1.05); }
.card-info { padding: 16px; }
.card-title { margin: 0 0 8px 0; font-size: 18px; color: #333; }
.card-tags { display: flex; gap: 8px; margin-bottom: 10px; }
.tag { background: #e7f3ff; color: #007bff; font-size: 12px; padding: 3px 10px; border-radius: 6px; }
.card-desc { font-size: 14px; color: #666; }

/* 底部输入框 */
.chat-footer { padding: 25px; background: #fff; border-top: 1px solid #eee; }
.input-area { display: flex; gap: 10px; background: #f5f7fa; padding: 10px 20px; border-radius: 30px; }
input { flex: 1; border: none; background: transparent; outline: none; font-size: 15px; }
button { background: #007bff; color: #fff; border: none; padding: 8px 24px; border-radius: 20px; cursor: pointer; transition: 0.2s; }
button:hover { background: #0056b3; }
button:disabled { background: #ccc; cursor: not-allowed; }

/* 侧边栏 */
.sidebar { position: absolute; left: 30px; top: 150px; width: 180px; z-index: 5; }
.tag-card { 
  background: white; padding: 12px; border-radius: 12px; margin-bottom: 12px; 
  cursor: pointer; box-shadow: 0 4px 12px rgba(0,0,0,0.05); transition: 0.3s; font-size: 13px;
}
.tag-card:hover { transform: translateX(8px); color: #007bff; }
@media (max-width: 1100px) { .sidebar { display: none; } }

/* 动画 */
@keyframes fadeInUp { from { opacity: 0; transform: translateY(20px); } to { opacity: 1; transform: translateY(0); } }
.dots { display: flex; gap: 4px; }
.dot { width: 6px; height: 6px; background: #007bff; border-radius: 50%; animation: blink 1.4s infinite; }
.dot:nth-child(2) { animation-delay: 0.2s; }
.dot:nth-child(3) { animation-delay: 0.4s; }
@keyframes blink { 0%, 100% { opacity: 0.3; } 50% { opacity: 1; } }
</style>