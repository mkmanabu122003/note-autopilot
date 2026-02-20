import { useState, useEffect } from 'react';
import ApiKeySection from '../components/settings/ApiKeySection';
import GoogleSheetsSection from '../components/settings/GoogleSheetsSection';
import AppSettingsSection from '../components/settings/AppSettingsSection';
import WritingGuidelinesSection from '../components/settings/WritingGuidelinesSection';
import SystemPromptSection from '../components/settings/SystemPromptSection';

export default function SettingsPage() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadConfig = async () => {
    try {
      const data = await window.electronAPI.config.getAll();
      setConfig(data || {});
    } catch {
      setConfig({});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  if (loading) {
    return (
      <div className="p-8">
        <h1 className="text-2xl font-bold text-gray-800 mb-6">設定</h1>
        <p className="text-gray-500 text-sm">読み込み中...</p>
      </div>
    );
  }

  return (
    <div className="p-8 max-w-3xl">
      <h1 className="text-2xl font-bold text-gray-800 mb-6">設定</h1>
      <div className="space-y-6">
        <ApiKeySection config={config} onConfigChange={loadConfig} />
        <GoogleSheetsSection config={config} onConfigChange={loadConfig} />
        <WritingGuidelinesSection config={config} onConfigChange={loadConfig} />
        <SystemPromptSection />
        <AppSettingsSection config={config} onConfigChange={loadConfig} />
      </div>
    </div>
  );
}
