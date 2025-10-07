// Supabase客户端配置
const SUPABASE_CONFIG = {
    url: 'https://elwiegxinwdrglxulfcw.supabase.co', // 替换为你的Supabase项目URL
    anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImVsd2llZ3hpbndkcmdseHVsZmN3Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4MTQwNjcsImV4cCI6MjA3NTM5MDA2N30.ToMdeBiSfxG8TihDzfg-pQHjGXHrDFnzmCJP2kMBTW0' // 替换为你的Supabase anon key
};

// 创建Supabase客户端
const supabase = supabase.createClient(SUPABASE_CONFIG.url, SUPABASE_CONFIG.anonKey, {
    auth: {
        autoRefreshToken: true,
        persistSession: true,
        detectSessionInUrl: true
    }
});

// Supabase数据同步管理
class SupabaseSyncManager {
    constructor() {
        this.isOnline = navigator.onLine;
        this.syncQueue = [];
        this.isSyncing = false;
        
        // 监听网络状态
        window.addEventListener('online', () => this.handleOnline());
        window.addEventListener('offline', () => this.handleOffline());
        
        // 初始化认证状态监听
        this.initAuthListener();
    }

    // 初始化认证监听
    initAuthListener() {
        supabase.auth.onAuthStateChange((event, session) => {
            console.log('Auth state changed:', event, session);
            this.updateAuthUI();
            
            if (event === 'SIGNED_IN' && session) {
                this.syncAllData();
            } else if (event === 'SIGNED_OUT') {
                this.clearUserData();
            }
        });
    }

    // 更新认证UI
    updateAuthUI() {
        const user = supabase.auth.getUser();
        const loggedOutView = document.getElementById('logged-out-view');
        const loggedInView = document.getElementById('logged-in-view');
        const userEmail = document.getElementById('user-email');

        if (user) {
            loggedOutView.classList.add('hidden');
            loggedInView.classList.remove('hidden');
            userEmail.textContent = user.email;
        } else {
            loggedOutView.classList.remove('hidden');
            loggedInView.classList.add('hidden');
        }
    }

    // 注册用户
    async signUp(email, password) {
        try {
            const { data, error } = await supabase.auth.signUp({
                email,
                password,
            });

            if (error) throw error;

            // 创建用户档案
            if (data.user) {
                await this.createUserProfile(data.user);
                return { success: true, message: '注册成功！请检查邮箱验证链接。' };
            }
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 用户登录
    async signIn(email, password) {
        try {
            const { data, error } = await supabase.auth.signInWithPassword({
                email,
                password,
            });

            if (error) throw error;
            return { success: true, message: '登录成功！' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 退出登录
    async signOut() {
        try {
            const { error } = await supabase.auth.signOut();
            if (error) throw error;
            return { success: true, message: '已退出登录' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 重置密码
    async resetPassword(email) {
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email);
            if (error) throw error;
            return { success: true, message: '密码重置链接已发送到您的邮箱' };
        } catch (error) {
            return { success: false, message: error.message };
        }
    }

    // 创建用户档案
    async createUserProfile(user) {
        try {
            const { error } = await supabase
                .from('user_profiles')
                .upsert({
                    id: user.id,
                    email: user.email,
                    username: user.email.split('@')[0],
                    created_at: new Date().toISOString(),
                    updated_at: new Date().toISOString()
                });

            if (error) throw error;
        } catch (error) {
            console.error('创建用户档案失败:', error);
        }
    }

    // 同步所有数据到Supabase
    async syncAllData() {
        if (!this.isOnline) {
            this.queueSync('full_sync');
            return { success: false, message: '网络离线，已加入同步队列' };
        }

        const user = await supabase.auth.getUser();
        if (!user) return { success: false, message: '用户未登录' };

        this.isSyncing = true;
        this.updateSyncStatus('同步中...');

        try {
            // 同步设置
            await this.syncSettings();
            
            // 同步单词数据
            await this.syncVocabularyData();
            
            // 同步学习进度
            await this.syncStudyProgress();
            
            this.updateSyncStatus('同步完成');
            return { success: true, message: '数据同步完成' };
        } catch (error) {
            this.updateSyncStatus('同步失败');
            console.error('同步失败:', error);
            return { success: false, message: '同步失败: ' + error.message };
        } finally {
            this.isSyncing = false;
        }
    }

    // 从Supabase加载所有数据
    async loadAllData() {
        const user = await supabase.auth.getUser();
        if (!user) return { success: false, message: '用户未登录' };

        try {
            // 加载设置
            await this.loadSettings();
            
            // 加载单词数据
            await this.loadVocabularyData();
            
            // 加载学习进度
            await this.loadStudyProgress();
            
            return { success: true, message: '数据加载完成' };
        } catch (error) {
            console.error('加载数据失败:', error);
            return { success: false, message: '加载数据失败: ' + error.message };
        }
    }

    // 同步设置
    async syncSettings() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        const { error } = await supabase
            .from('user_settings')
            .upsert({
                user_id: user.id,
                ...appState.settings,
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    }

    // 加载设置
    async loadSettings() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        const { data, error } = await supabase
            .from('user_settings')
            .select('*')
            .eq('user_id', user.id)
            .single();

        if (error && error.code !== 'PGRST116') throw error; // PGRST116表示没有找到记录

        if (data) {
            // 合并设置，保留本地没有的默认值
            appState.settings = { ...appState.settings, ...data };
            updateSettingsUI();
            saveAppState();
        }
    }

    // 同步单词数据
    async syncVocabularyData() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        // 同步每个单元的单词
        for (const [unitNumber, words] of Object.entries(appState.units)) {
            // 首先创建或获取单元
            const unit = await this.getOrCreateUnit(user.id, parseInt(unitNumber));
            
            // 同步单元中的每个单词
            for (const wordData of words) {
                await this.syncWord(user.id, unit.id, wordData);
            }
        }
    }

    // 获取或创建单元
    async getOrCreateUnit(userId, unitNumber) {
        const { data: existingUnit, error: selectError } = await supabase
            .from('vocabulary_units')
            .select('*')
            .eq('user_id', userId)
            .eq('unit_number', unitNumber)
            .single();

        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        if (existingUnit) {
            return existingUnit;
        } else {
            const { data: newUnit, error: insertError } = await supabase
                .from('vocabulary_units')
                .insert({
                    user_id: userId,
                    unit_number: unitNumber,
                    unit_name: `单元 ${unitNumber}`,
                    created_at: new Date().toISOString()
                })
                .select()
                .single();

            if (insertError) throw insertError;
            return newUnit;
        }
    }

    // 同步单个单词
    async syncWord(userId, unitId, wordData) {
        const { data: existingWord, error: selectError } = await supabase
            .from('vocabulary_words')
            .select('*')
            .eq('user_id', userId)
            .eq('unit_id', unitId)
            .eq('word', wordData.word)
            .single();

        if (selectError && selectError.code !== 'PGRST116') throw selectError;

        const wordRecord = {
            user_id: userId,
            unit_id: unitId,
            word: wordData.word,
            phonetic: wordData.phonetic,
            part_of_speech: wordData.partOfSpeech,
            definition: wordData.definition,
            example: wordData.example,
            memory: wordData.memory,
            derivative: wordData.derivative,
            extra_data: wordData.extra || null,
            created_at: new Date().toISOString()
        };

        if (existingWord) {
            // 更新现有单词
            const { error } = await supabase
                .from('vocabulary_words')
                .update(wordRecord)
                .eq('id', existingWord.id);

            if (error) throw error;
        } else {
            // 插入新单词
            const { error } = await supabase
                .from('vocabulary_words')
                .insert(wordRecord);

            if (error) throw error;
        }
    }

    // 同步学习进度
    async syncStudyProgress() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        // 同步已掌握的单词
        for (const [wordKey, isMastered] of Object.entries(appState.masteredWords)) {
            if (isMastered) {
                await this.syncWordProgress(user.id, wordKey, { isMastered: true });
            }
        }

        // 同步生词本
        for (const [wordKey, isDifficult] of Object.entries(appState.difficultWords)) {
            if (isDifficult) {
                await this.syncWordProgress(user.id, wordKey, { 
                    isDifficult: true,
                    correctCount: appState.correctCounts[wordKey] || 0
                });
            }
        }

        // 同步学习记录
        await this.syncStudyRecords(user.id);
    }

    // 同步单词进度
    async syncWordProgress(userId, wordKey, progressData) {
        const [unitNumber, word] = wordKey.split('-');
        
        // 获取单元
        const unit = await this.getOrCreateUnit(userId, parseInt(unitNumber));
        
        // 获取单词ID
        const { data: wordRecord, error: wordError } = await supabase
            .from('vocabulary_words')
            .select('id')
            .eq('user_id', userId)
            .eq('unit_id', unit.id)
            .eq('word', word)
            .single();

        if (wordError) throw wordError;

        // 更新或插入学习进度
        const { error } = await supabase
            .from('study_progress')
            .upsert({
                user_id: userId,
                word_id: wordRecord.id,
                ...progressData,
                last_studied: new Date().toISOString(),
                updated_at: new Date().toISOString()
            });

        if (error) throw error;
    }

    // 同步学习记录
    async syncStudyRecords(userId) {
        const today = getTodayString();
        
        for (const [date, unitProgress] of Object.entries(appState.studyProgress)) {
            for (const [unitNumber, studiedCount] of Object.entries(unitProgress)) {
                const unit = await this.getOrCreateUnit(userId, parseInt(unitNumber));
                
                const { error } = await supabase
                    .from('daily_study_records')
                    .upsert({
                        user_id: userId,
                        study_date: date,
                        unit_id: unit.id,
                        words_studied: studiedCount,
                        words_mastered: 0, // 可以根据需要计算
                        created_at: new Date().toISOString()
                    });

                if (error) throw error;
            }
        }
    }

    // 从Supabase加载单词数据
    async loadVocabularyData() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        // 获取所有单元
        const { data: units, error: unitsError } = await supabase
            .from('vocabulary_units')
            .select('*')
            .eq('user_id', user.id)
            .order('unit_number');

        if (unitsError) throw unitsError;

        // 重置本地数据
        appState.units = {};

        for (const unit of units) {
            // 获取该单元的所有单词
            const { data: words, error: wordsError } = await supabase
                .from('vocabulary_words')
                .select('*')
                .eq('user_id', user.id)
                .eq('unit_id', unit.id)
                .order('created_at');

            if (wordsError) throw wordsError;

            // 转换数据格式
            appState.units[unit.unit_number] = words.map(word => ({
                word: word.word,
                phonetic: word.phonetic,
                partOfSpeech: word.part_of_speech,
                definition: word.definition,
                example: word.example,
                memory: word.memory,
                derivative: word.derivative,
                extra: word.extra_data
            }));
        }

        // 重新计算分块
        if (appState.units[appState.currentUnit]) {
            calculateChunks(appState.units[appState.currentUnit]);
        }
    }

    // 从Supabase加载学习进度
    async loadStudyProgress() {
        const user = await supabase.auth.getUser();
        if (!user) return;

        // 重置本地进度
        appState.masteredWords = {};
        appState.difficultWords = {};
        appState.correctCounts = {};
        appState.studyProgress = {};

        // 获取学习进度
        const { data: progressRecords, error: progressError } = await supabase
            .from('study_progress')
            .select(`
                *,
                vocabulary_words (
                    word,
                    vocabulary_units (
                        unit_number
                    )
                )
            `)
            .eq('user_id', user.id);

        if (progressError) throw progressError;

        // 处理学习进度
        for (const record of progressRecords || []) {
            const wordKey = `${record.vocabulary_words.vocabulary_units.unit_number}-${record.vocabulary_words.word}`;
            
            if (record.is_mastered) {
                appState.masteredWords[wordKey] = true;
            }
            
            if (record.is_difficult) {
                appState.difficultWords[wordKey] = true;
                appState.correctCounts[wordKey] = record.correct_count;
            }
        }

        // 获取学习记录
        const { data: studyRecords, error: recordsError } = await supabase
            .from('daily_study_records')
            .select(`
                *,
                vocabulary_units (
                    unit_number
                )
            `)
            .eq('user_id', user.id);

        if (recordsError) throw recordsError;

        // 处理学习记录
        for (const record of studyRecords || []) {
            const date = record.study_date;
            const unitNumber = record.vocabulary_units.unit_number;
            
            if (!appState.studyProgress[date]) {
                appState.studyProgress[date] = {};
            }
            appState.studyProgress[date][unitNumber] = record.words_studied;
        }
    }

    // 处理网络在线
    handleOnline() {
        this.isOnline = true;
        this.updateSyncStatus('在线，等待同步');
        
        // 执行队列中的同步任务
        if (this.syncQueue.length > 0) {
            this.processSyncQueue();
        }
    }

    // 处理网络离线
    handleOffline() {
        this.isOnline = false;
        this.updateSyncStatus('离线');
    }

    // 更新同步状态显示
    updateSyncStatus(status) {
        const syncStatusElement = document.getElementById('sync-status');
        if (syncStatusElement) {
            syncStatusElement.textContent = status;
        }
    }

    // 添加到同步队列
    queueSync(operation) {
        this.syncQueue.push(operation);
        this.updateSyncStatus('操作已加入同步队列');
    }

    // 处理同步队列
    async processSyncQueue() {
        while (this.syncQueue.length > 0 && this.isOnline) {
            const operation = this.syncQueue.shift();
            await this.syncAllData();
        }
    }

    // 清除用户数据（退出时）
    clearUserData() {
        // 保留本地数据，但重置用户相关状态
        appState.masteredWords = {};
        appState.difficultWords = {};
        appState.correctCounts = {};
        appState.studyProgress = {};
        
        // 重新渲染界面
        renderVocabularyCards();
        updateStats();
    }
}

// 创建全局同步管理器实例
let syncManager;

// 初始化同步管理器
function initSupabaseSync() {
    syncManager = new SupabaseSyncManager();
    
    // 检查初始认证状态
    syncManager.updateAuthUI();
    
    // 如果用户已登录，加载数据
    supabase.auth.getUser().then(({ data: { user } }) => {
        if (user) {
            syncManager.loadAllData().then(result => {
                if (result.success) {
                    console.log('初始数据加载成功');
                    renderVocabularyCards();
                    updateStats();
                }
            });
        }
    });
}