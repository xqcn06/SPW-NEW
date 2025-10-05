// PWA 安装提示功能
class PWAInstallPrompt {
  constructor() {
    this.deferredPrompt = null;
    this.installButton = null;
    this.init();
  }

  init() {
    // 监听 beforeinstallprompt 事件
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault();
      this.deferredPrompt = e;
      this.showInstallPrompt();
    });

    // 监听应用安装成功
    window.addEventListener('appinstalled', () => {
      console.log('PWA 已成功安装');
      this.hideInstallPrompt();
      this.showToast('应用已成功安装到设备！', 'success');
    });

    this.createInstallButton();
  }

  createInstallButton() {
    // 创建安装按钮
    this.installButton = document.createElement('button');
    this.installButton.innerHTML = `
      <i class="fa fa-download mr-2"></i>
      安装应用
    `;
    this.installButton.className = 'fixed bottom-4 left-4 bg-primary hover:bg-primary/90 text-white px-4 py-2 rounded-lg shadow-lg transition-all duration-300 z-50 hidden touch-button';
    this.installButton.addEventListener('click', () => this.installApp());
    
    document.body.appendChild(this.installButton);
  }

  showInstallPrompt() {
    if (this.installButton && this.deferredPrompt) {
      this.installButton.classList.remove('hidden');
      
      // 7秒后自动隐藏
      setTimeout(() => {
        this.hideInstallPrompt();
      }, 7000);
    }
  }

  hideInstallPrompt() {
    if (this.installButton) {
      this.installButton.classList.add('hidden');
    }
  }

  async installApp() {
    if (!this.deferredPrompt) return;

    this.deferredPrompt.prompt();
    const { outcome } = await this.deferredPrompt.userChoice;
    
    if (outcome === 'accepted') {
      console.log('用户接受了PWA安装提示');
      this.hideInstallPrompt();
    } else {
      console.log('用户拒绝了PWA安装提示');
    }
    
    this.deferredPrompt = null;
  }

  showToast(message, type = 'info') {
    // 使用应用中已有的 toast 功能或创建一个简单的提示
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