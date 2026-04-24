import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
    plugins: [vue()],

    // ++++ 新增：开发服务器配置 ++++
    server: {
        proxy: {
            // '/api' 是你要替换的请求地址中的路径开头
            '/api': {
                // 【请修改】target: 替换成你的后端服务器地址 (协议://IP:端口)
                target: 'http://47.111.15.132:8000',
                // 改变请求的源为目标URL，解决CORS
                changeOrigin: true,
                // 【可选】如果后端接口路径没有 '/api' 开头，需要重写去掉它
                // rewrite: (path) => path.replace(/^\/api/, '')
            }
        }
    }
    // ++++ 新增结束 ++++
})