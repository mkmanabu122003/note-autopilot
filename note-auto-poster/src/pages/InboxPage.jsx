import { useState, useEffect, useCallback } from 'react';
import { useToast } from '../hooks/useToast';
import SetupBanner from '../components/common/SetupBanner';
import ConfirmDialog from '../components/common/ConfirmDialog';
import FilterPanel from '../components/inbox/FilterPanel';
import TopicList from '../components/inbox/TopicList';
import ArticleList from '../components/inbox/ArticleList';
import GenerationPanel from '../components/inbox/GenerationPanel';
import ArticlePreview from '../components/inbox/ArticlePreview';

export default function InboxPage() {
  const { showToast } = useToast();
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState('');
  const [accountData, setAccountData] = useState(null);

  const [view, setView] = useState('topics');
  const [statusFilters, setStatusFilters] = useState([]);
  const [pillarFilters, setPillarFilters] = useState([]);

  const [topics, setTopics] = useState([]);
  const [articles, setArticles] = useState([]);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [selectedArticle, setSelectedArticle] = useState(null);
  const [loadError, setLoadError] = useState('');

  const [generating, setGenerating] = useState(false);
  const [generatingSingle, setGeneratingSingle] = useState(false);
  const [batchId, setBatchId] = useState(null);
  const [showConfirm, setShowConfirm] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  // GitHub sync state
  const [githubEnabled, setGithubEnabled] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState(null);

  // Load accounts on mount + check GitHub sync status
  useEffect(() => {
    async function load() {
      try {
        const active = await window.electronAPI.accounts.listActive();
        setAccounts(active || []);
        if (active && active.length > 0 && !selectedAccount) {
          setSelectedAccount(active[0].id);
        }
      } catch {
        setAccounts([]);
      }
      // Check GitHub enabled
      try {
        const ghEnabled = await window.electronAPI.config.get('github.enabled');
        setGithubEnabled(!!ghEnabled);
        if (ghEnabled) {
          const status = await window.electronAPI.github.status();
          if (status.lastSyncTime) setLastSyncTime(status.lastSyncTime);
        }
      } catch {
        // GitHub not configured
      }
    }
    load();
  }, []);

  // Load account data when account changes
  useEffect(() => {
    if (!selectedAccount) {
      setAccountData(null);
      return;
    }
    async function load() {
      try {
        const data = await window.electronAPI.accounts.get(selectedAccount);
        setAccountData(data);
      } catch {
        setAccountData(null);
      }
    }
    load();
  }, [selectedAccount]);

  // Load data when account or view changes
  const loadData = useCallback(async () => {
    if (!selectedAccount) return;
    setLoadError('');
    try {
      if (view === 'topics') {
        const data = await window.electronAPI.topics.list(selectedAccount);
        if (data && data.error) {
          setLoadError(data.error);
          setTopics(data.topics || []);
        } else {
          setTopics(Array.isArray(data) ? data : []);
        }
      } else {
        const data = await window.electronAPI.articles.list(selectedAccount);
        setArticles(data || []);
      }
    } catch (e) {
      setLoadError(e.message || 'データの読み込みに失敗しました');
      if (view === 'topics') setTopics([]);
      else setArticles([]);
    }
  }, [selectedAccount, view]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleStatusFilterChange = (status) => {
    setStatusFilters((prev) =>
      prev.includes(status) ? prev.filter((s) => s !== status) : [...prev, status]
    );
  };

  const handlePillarFilterChange = (pillarId) => {
    setPillarFilters((prev) =>
      prev.includes(pillarId) ? prev.filter((p) => p !== pillarId) : [...prev, pillarId]
    );
  };

  // Apply filters
  const filteredTopics = topics.filter((t) => {
    if (statusFilters.length > 0 && !statusFilters.includes(t.status || 'pending')) return false;
    if (pillarFilters.length > 0 && !pillarFilters.includes(t.pillar)) return false;
    return true;
  });

  const filteredArticles = articles.filter((a) => {
    if (statusFilters.length > 0 && !statusFilters.includes(a.status)) return false;
    if (pillarFilters.length > 0 && !pillarFilters.includes(a.pillar)) return false;
    return true;
  });

  // Immediate single-topic generation
  const handleGenerateSingle = async () => {
    if (!selectedTopic || !selectedAccount) return;
    setGeneratingSingle(true);
    try {
      const result = await window.electronAPI.generator.runSingle(selectedAccount, selectedTopic.id);
      if (result.error) {
        showToast('生成エラー: ' + result.error, 'error');
        setGeneratingSingle(false);
        loadData();
        return;
      }
      showToast('記事が生成されました', 'success');
      // Show generated article in preview
      setSelectedArticle(result.article);
      setView('articles');
      setSelectedTopic(null);
      loadData();
    } catch (e) {
      showToast('生成に失敗しました: ' + (e.message || ''), 'error');
    } finally {
      setGeneratingSingle(false);
    }
  };

  // Batch generation
  const handleGenerateClick = async () => {
    const pending = topics.filter((t) => (t.status || 'pending') === 'pending');
    setPendingCount(pending.length);
    setShowConfirm(true);
  };

  const handleGenerate = async () => {
    setShowConfirm(false);
    setGenerating(true);
    try {
      const result = await window.electronAPI.generator.run(selectedAccount);
      if (result.error) {
        showToast('生成エラー: ' + result.error, 'error');
        setGenerating(false);
        loadData();
        return;
      }
      if (result.batchId) {
        setBatchId(result.batchId);
      }
      showToast(`${result.generated || 0}件の記事が生成されました（エラー: ${result.errors || 0}件）`, 'success');
      setGenerating(false);
      setBatchId(null);
      setView('articles');
      loadData();
    } catch (e) {
      showToast('生成に失敗しました', 'error');
      setGenerating(false);
    }
  };

  const handleGenerationComplete = () => {
    setGenerating(false);
    setBatchId(null);
    showToast('バッチ生成が完了しました', 'success');
    setView('articles');
    loadData();
  };

  const handleTopicSelect = (topic) => {
    setSelectedTopic(selectedTopic?.id === topic.id ? null : topic);
  };

  const handleArticleSelect = async (article) => {
    try {
      const full = await window.electronAPI.articles.get(selectedAccount, article.id);
      setSelectedArticle(full || article);
    } catch {
      setSelectedArticle(article);
    }
  };

  const handleArticleUpdate = () => {
    loadData();
    if (selectedArticle) {
      window.electronAPI.articles
        .get(selectedAccount, selectedArticle.id)
        .then((updated) => {
          if (updated) setSelectedArticle(updated);
        })
        .catch(() => {});
    }
  };

  // Regenerate an article (find its topic and re-run generation)
  const handleRegenerate = async (article, regenerateInstructions) => {
    if (!selectedAccount) return;
    setGeneratingSingle(true);
    try {
      // Try to find the matching topic by topicId or by theme
      const topicId = article.topicId;
      if (topicId) {
        const result = await window.electronAPI.generator.runSingle(selectedAccount, topicId, regenerateInstructions || undefined);
        if (result.error) {
          showToast('再生成エラー: ' + result.error, 'error');
        } else {
          showToast('記事を再生成しました', 'success');
          setSelectedArticle(result.article);
        }
      } else {
        // No topicId — switch to topics view so user can pick the topic
        showToast('テーマビューからテーマを選んで「即時生成」してください', 'info');
        setView('topics');
        setSelectedArticle(null);
      }
      loadData();
    } catch (e) {
      showToast('再生成に失敗しました: ' + (e.message || ''), 'error');
    } finally {
      setGeneratingSingle(false);
    }
  };

  // GitHub sync handler
  const handleGitHubSync = async () => {
    if (!selectedAccount || syncing) return;
    setSyncing(true);
    try {
      // Check if PR mode is enabled
      const prMode = await window.electronAPI.config.get('github.pr_mode');
      const result = prMode
        ? await window.electronAPI.github.syncWithPR(selectedAccount)
        : await window.electronAPI.github.sync(selectedAccount);
      if (result.success) {
        let msg = `同期完了（push: ${result.pushed || 0}件, pull: ${result.pulled || 0}件）`;
        if (result.pr?.url) {
          msg += result.pr.created ? ' PRを作成しました' : ' PR更新済み';
        }
        showToast(msg, 'success');
        setLastSyncTime(new Date().toISOString());
        loadData();
      } else if (result.skipped) {
        showToast('同期中です。しばらくお待ちください', 'info');
      } else {
        showToast('同期エラー: ' + (result.error || ''), 'error');
      }
    } catch (e) {
      showToast('同期に失敗しました: ' + (e.message || ''), 'error');
    } finally {
      setSyncing(false);
    }
  };

  const pillars = accountData?.pillars || [];
  const accountDisplayName =
    accounts.find((a) => a.id === selectedAccount)?.display_name || selectedAccount;

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 pb-0">
        <SetupBanner />
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left: Filter Panel */}
        <FilterPanel
          accounts={accounts}
          selectedAccount={selectedAccount}
          onAccountChange={setSelectedAccount}
          view={view}
          onViewChange={setView}
          statusFilters={statusFilters}
          onStatusFilterChange={handleStatusFilterChange}
          pillars={pillars}
          pillarFilters={pillarFilters}
          onPillarFilterChange={handlePillarFilterChange}
          onRefresh={loadData}
        />

        {/* Center: List */}
        <div className="flex-1 overflow-y-auto">
          {/* No account selected */}
          {!selectedAccount && (
            <div className="p-6 text-center text-gray-400 text-sm">
              {accounts.length === 0
                ? 'アカウントが見つかりません。アカウント管理ページで有効なアカウントを設定してください。'
                : '左のパネルからアカウントを選択してください。'}
            </div>
          )}

          {/* Generation controls */}
          {view === 'topics' && selectedAccount && (
            <div className="p-3 border-b border-gray-200 flex items-center gap-2">
              <button
                onClick={handleGenerateClick}
                disabled={generating || generatingSingle || !selectedAccount}
                className="px-3 py-1.5 text-sm rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {generating ? '生成中...' : 'バッチ生成'}
              </button>
              {selectedTopic && (
                <button
                  onClick={handleGenerateSingle}
                  disabled={generating || generatingSingle}
                  className="px-3 py-1.5 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {generatingSingle ? '生成中...' : `「${selectedTopic.theme?.substring(0, 20) || ''}...」を即時生成`}
                </button>
              )}
            </div>
          )}

          {/* GitHub Sync bar */}
          {githubEnabled && selectedAccount && (
            <div className="px-3 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
              <div className="flex items-center gap-2 text-xs text-gray-500">
                <span className={`w-2 h-2 rounded-full ${syncing ? 'bg-yellow-400 animate-pulse' : lastSyncTime ? 'bg-green-400' : 'bg-gray-300'}`} />
                {syncing
                  ? '同期中...'
                  : lastSyncTime
                    ? `最終同期: ${new Date(lastSyncTime).toLocaleTimeString()}`
                    : '未同期'}
              </div>
              <button
                onClick={handleGitHubSync}
                disabled={syncing}
                className="px-2 py-1 text-xs rounded border border-gray-300 text-gray-600 hover:bg-gray-100 disabled:opacity-50"
              >
                {syncing ? '同期中...' : 'GitHub同期'}
              </button>
            </div>
          )}

          {/* Generation progress */}
          {generating && batchId && (
            <div className="p-3">
              <GenerationPanel
                batchId={batchId}
                onComplete={handleGenerationComplete}
              />
            </div>
          )}

          {/* Generating single indicator */}
          {generatingSingle && (
            <div className="mx-3 mt-2 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
              「{selectedTopic?.theme}」の記事を生成中... しばらくお待ちください。
            </div>
          )}

          {/* Error message */}
          {loadError && (
            <div className="mx-3 mt-2 p-3 bg-red-50 border border-red-200 rounded text-sm text-red-700">
              <span className="font-bold">エラー: </span>{loadError}
            </div>
          )}

          {/* Content */}
          <div>
            {view === 'topics' ? (
              <TopicList
                topics={filteredTopics}
                selectedId={selectedTopic?.id}
                onSelect={handleTopicSelect}
              />
            ) : (
              <ArticleList
                articles={filteredArticles}
                selectedId={selectedArticle?.id}
                onSelect={handleArticleSelect}
              />
            )}
          </div>
        </div>

        {/* Right: Article Preview */}
        {selectedArticle && view === 'articles' && (
          <ArticlePreview
            article={selectedArticle}
            accountId={selectedAccount}
            onUpdate={handleArticleUpdate}
            onClose={() => setSelectedArticle(null)}
            onRegenerate={handleRegenerate}
            regenerating={generatingSingle}
          />
        )}

        {/* Right: Topic detail panel */}
        {selectedTopic && view === 'topics' && (
          <div className="w-[350px] shrink-0 border-l border-gray-200 bg-white p-4 overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-gray-800">テーマ詳細</h3>
              <button
                onClick={() => setSelectedTopic(null)}
                className="text-gray-400 hover:text-gray-600 text-lg"
              >
                &times;
              </button>
            </div>
            <div className="space-y-3 text-sm">
              <div>
                <span className="text-gray-500">ID:</span>
                <span className="ml-2 text-gray-800">{selectedTopic.id}</span>
              </div>
              <div>
                <span className="text-gray-500">テーマ:</span>
                <p className="mt-1 text-gray-800">{selectedTopic.theme}</p>
              </div>
              {selectedTopic.keywords && (
                <div>
                  <span className="text-gray-500">キーワード:</span>
                  <p className="mt-1 text-gray-800">{selectedTopic.keywords}</p>
                </div>
              )}
              {selectedTopic.additional_instructions && (
                <div>
                  <span className="text-gray-500">追加指示:</span>
                  <p className="mt-1 text-gray-800">{selectedTopic.additional_instructions}</p>
                </div>
              )}
              {selectedTopic.pillar && (
                <div>
                  <span className="text-gray-500">柱:</span>
                  <span className="ml-2 text-gray-800">{selectedTopic.pillar}</span>
                </div>
              )}
              <div>
                <span className="text-gray-500">ステータス:</span>
                <span className="ml-2 text-gray-800">{selectedTopic.status || 'pending'}</span>
              </div>
              {selectedTopic.is_paid && (
                <div>
                  <span className="text-gray-500">有料:</span>
                  <span className="ml-2 text-gray-800">{selectedTopic.price}円</span>
                </div>
              )}
              <div className="pt-3 border-t border-gray-200">
                <button
                  onClick={handleGenerateSingle}
                  disabled={generating || generatingSingle || (selectedTopic.status !== 'pending' && selectedTopic.status !== 'error' && selectedTopic.status !== '')}
                  className="w-full px-3 py-2 text-sm rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50"
                >
                  {generatingSingle ? '生成中...' : 'このテーマで記事を即時生成'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={showConfirm}
        title="バッチ生成を開始"
        message={`${accountDisplayName} のpendingテーマ ${pendingCount}件 でバッチ生成を開始しますか？`}
        confirmText="生成開始"
        onConfirm={handleGenerate}
        onCancel={() => setShowConfirm(false)}
      />
    </div>
  );
}
