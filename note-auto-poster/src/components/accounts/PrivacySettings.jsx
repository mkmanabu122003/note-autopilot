const PRIVACY_FIELDS = [
  { key: 'real_name', label: '本名' },
  { key: 'international_marriage', label: '国際結婚' },
  { key: 'residence', label: '居住地' },
  { key: 'guide_years', label: 'ガイド歴' },
  { key: 'guest_count', label: '案内人数' },
  { key: 'review_rating', label: 'レビュー評価' },
  { key: 'monthly_revenue', label: '月間収益' },
  { key: 'ota_platform_names', label: 'OTAプラットフォーム名' },
  { key: 'ota_platform_count', label: 'OTAプラットフォーム数' },
  { key: 'nihonneta', label: 'NihonNeta' },
  { key: 'ai_tool_details', label: 'AIツール詳細' },
  { key: 'activity_area', label: '活動エリア' },
];

const OPTIONS = ['public', 'vague', 'hidden'];

const DOT_COLORS = {
  public: 'bg-green-500',
  vague: 'bg-yellow-500',
  hidden: 'bg-red-500',
};

export default function PrivacySettings({ privacy, onChange }) {
  const handleChange = (key, value) => {
    onChange({ ...privacy, [key]: value });
  };

  return (
    <div>
      <h3 className="text-sm font-bold text-gray-700 mb-2">プライバシー設定</h3>
      <div className="border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <tbody>
            {PRIVACY_FIELDS.map((field) => (
              <tr key={field.key} className="border-t border-gray-100 first:border-t-0">
                <td className="px-3 py-1.5 text-gray-600 w-48">{field.label}</td>
                <td className="px-3 py-1.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        DOT_COLORS[privacy?.[field.key] || 'hidden']
                      }`}
                    />
                    <select
                      value={privacy?.[field.key] || 'hidden'}
                      onChange={(e) => handleChange(field.key, e.target.value)}
                      className="border border-gray-300 rounded px-2 py-0.5 text-sm"
                    >
                      {OPTIONS.map((opt) => (
                        <option key={opt} value={opt}>
                          {opt}
                        </option>
                      ))}
                    </select>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
