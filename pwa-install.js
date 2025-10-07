// PWA 安装提示功能 - 增强 Edge 支持
class PWAInstallPrompt {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.isEdge = navigator.userAgent.includes('Edg/');
    this.init();
  }

  init() {
    console.log('初始化 PWA 安装提示，检测到 Edge:', this.isEdge);
    
    // 监听 beforeinstallprompt 事件
    window.addEventListener('beforeinstallprompt', (e) => {
      console.log('beforeinstallprompt 事件触发');
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallPrompt();
    });

    // 监听应用安装成功
    window.addEventListener('appinstalled', () => {
      console.log('PWA 已成功安装');
      this.hideInstallPrompt();
      this.showToast('应用已成功安装到设备！', 'success');
      
      // 在 Edge 中额外记录安装状态
      if (this.isEdge) {
        localStorage.setItem('pwa_installed_edge', 'true');
      }
    });

    // 检查是否已经安装
    this.checkIfInstalled();
    this.createInstallButton();
  }

  checkIfInstalled() {
    // 检查是否以独立模式运行
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches || 
                        window.navigator.standalone === true;
    
    if (isStandalone) {
      console.log('应用正在以 PWA 模式运行');
      this.hideInstallPrompt();
    }
  }

  createInstallButton() {
    // 创建安装按钮
    this.installButton = document.createElement('button');
    this.installButton.innerHTML = `
      <i class="fa fa-download mr-2"></i>
      安装应用
    `;
    this.installButton.className = 'fixed bottom-4 left-4 bg-primary hover:bg-primary/90 text-white px-4 py-3 rounded-lg shadow-lg transition-all duration-300 z-50 hidden touch-button';
    this.installButton.style.cssText = 'min-width: 120px; min-height: 44px;';
    this.installButton.addEventListener('click', () => this.installApp());
    
    document.body.appendChild(this.installButton);

    // 添加手动安装提示（针对 Edge）
    if (this.isEdge) {
      this.createEdgeInstallHint();
    }
  }

  createEdgeInstallHint() {
    const hint = document.createElement('div');
    hint.innerHTML = `
      <div class="fixed bottom-20 left-4 bg-blue-100 border border-blue-300 text-blue-800 px-4 py-3 rounded-lg shadow-lg max-w-xs z-50 hidden" id="edge-install-hint">
        <p class="text-sm font-medium">Edge 浏览器安装提示</p>
        <p class="text-xs mt-1">点击地址栏中的 <i class="fa fa-plus-square"></i> 图标安装应用</p>
        <button class="text-xs text-blue-600 hover:text-blue-800 mt-2" id="close-edge-hint">知道了</button>
      </div>
    `;
    document.body.appendChild(hint);

    // 显示 Edge 安装提示
    setTimeout(() => {
      const edgeHint = document.getElementById('edge-install-hint');
      const closeBtn = document.getElementById('close-edge-hint');
      
      if (edgeHint && !localStorage.getItem('edge_hint_shown')) {
        edgeHint.classList.remove('hidden');
        localStorage.setItem('edge_hint_shown', 'true');
      }

      closeBtn?.addEventListener('click', () => {
        edgeHint.classList.add('hidden');
      });
    }, 3000);
  }

  showInstallPrompt() {
    if (this.installButton && this.deferredPrompt) {
      this.installButton.classList.remove('hidden');
      
      // 10秒后自动隐藏
      setTimeout(() => {
        this.hideInstallPrompt();
      }, 10000);
    }
  }

  hideInstallPrompt() {
    if (this.installButton) {
      this.installButton.classList.add('hidden');
    }
  }

  async installApp() {
    if (!this.deferredPrompt) {
      // 如果没有触发 beforeinstallprompt，显示手动安装说明
      this.showManualInstallInstructions();
      return;
    }

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('用户接受了PWA安装提示');
      this.hideInstallPrompt();
    } else {
      console.log('用户拒绝了PWA安装提示');
      // 显示手动安装说明
      this.showManualInstallInstructions();
    }
    
    this.deferredPrompt = null;
  }

  showManualInstallInstructions() {
    const instructions = document.createElement('div');
    instructions.innerHTML = `
      <div class="fixed inset-0 flex items-center justify-center z-50 bg-black/50">
        <div class="bg-white dark:bg-dark-card rounded-xl p-6 max-w-md mx-4">
          <h3 class="text-lg font-bold mb-4">手动安装说明</h3>
          <div class="text-sm space-y-2">
            <p><strong>Edge 浏览器：</strong></p>
            <p>1. 点击地址栏右侧的 <i class="fa fa-plus-square text-primary"></i> 图标</p>
            <p>2. 选择"安装"</p>
            <p class="mt-3"><strong>其他浏览器：</strong></p>
            <p>在菜单中查找"添加到主屏幕"或"安装应用"选项</p>
          </div>
          <button class="w-full bg-primary text-white py-2 rounded-lg mt-4 touch-button" id="close-instructions">
            关闭
          </button>
        </div>
      </div>
    `;
    document.body.appendChild(instructions);

    document.getElementById('close-instructions').addEventListener('click', () => {
      document.body.removeChild(instructions);
    });
  }

  showToast(message, type = 'info') {
    const toast = document.createElement('div');
    const colors = {
      info: 'bg-blue-500',
      success: 'bg-green-500',
      error: 'bg-red-500',
      warning: 'bg-yellow-500'
    };
    
    toast.className = `fixed bottom-4 right-4 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300 opacity-0 transform translate-y-4 ${colors[type]} z-50`;
    toast.textContent = message;
    document.body.appendChild(toast);
    
    setTimeout(() => {
      toast.classList.remove('opacity-0', 'translate-y-4');
      toast.classList.add('opacity-100', 'translate-y-0');
    }, 10);
    
    setTimeout(() => {
      toast.classList.remove('opacity-100', 'translate-y-0');
      toast.classList.add('opacity-0', 'translate-y-4');
      setTimeout(() => {
        document.body.removeChild(toast);
      }, 300);
    }, 3000);
  }
}

// 初始化 PWA 安装提示
document.addEventListener('DOMContentLoaded', () => {
  new PWAInstallPrompt();
});