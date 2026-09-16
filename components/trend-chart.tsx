'use client';

import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Treemap,
  ResponsiveContainer,
  Tooltip,
  Cell,
  PieChart,
  Pie,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useEffect, useState } from 'react';
import {
  Loader2,
  Sparkles,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Zap,
  Building2,
  Cpu,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';

interface Article {
  title: string;
  snippet: string;
  source?: string;
}

interface TrendData {
  name: string;
  value: number;
  signal?: 'emerging' | 'growing' | 'established' | 'declining';
  labs?: string[];
}

interface TrendResponse {
  trends: TrendData[];
  summary?: string;
  modelUsed?: string;
  cached?: boolean;
}

// Normative FDE & Google Quad Brand Colors (palette.json)
const SIGNAL_COLORS: Record<
  string,
  { bg: string; text: string; border: string; icon: any; label: string }
> = {
  emerging: {
    bg: 'bg-[#E8F0FE]',
    text: 'text-[#4471ED]',
    border: 'border-[#4471ED]/30',
    icon: Zap,
    label: 'Emerging',
  },
  growing: {
    bg: 'bg-[#E6F4EA]',
    text: 'text-[#137333]',
    border: 'border-[#34A853]/30',
    icon: TrendingUp,
    label: 'Growing',
  },
  established: {
    bg: 'bg-[#F1F3F4]',
    text: 'text-[#202124]',
    border: 'border-[#DADCE0]',
    icon: Building2,
    label: 'Established',
  },
  declining: {
    bg: 'bg-[#FEF7E0]',
    text: 'text-[#B06000]',
    border: 'border-[#FBBC04]/40',
    icon: TrendingDown,
    label: 'Declining',
  },
};

const TREEMAP_COLORS = [
  '#4471ED', // AI Tech Sparkle Blue
  '#4285F4', // Google Blue
  '#34A853', // Google Green
  '#0764FF', // Divider Blue
  '#FF9302', // Divider Orange
  '#EC4032', // Divider Red
  '#202124', // FDE Dark Canvas
];

const LAB_COLORS: Record<string, string> = {
  'Google Research': '#4285F4',
  'Google DeepMind': '#4471ED',
  OpenAI: '#10a37f',
  Anthropic: '#EC4032',
  'Microsoft Research': '#0764FF',
  'Meta AI': '#0668E1',
  'x.AI': '#202124',
};

function SignalBadge({ signal }: { signal: string }) {
  const s = SIGNAL_COLORS[signal] || SIGNAL_COLORS.emerging;
  const Icon = s.icon;
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-bold uppercase tracking-wider ${s.bg} ${s.text} ${s.border} border`}
    >
      <Icon className="w-3 h-3" />
      {s.label}
    </span>
  );
}

function TrendScoreRing({ value, size = 44 }: { value: number; size?: number }) {
  const radius = (size - 6) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const color = value >= 75 ? '#4471ED' : value >= 50 ? '#34A853' : '#5F6368';

  return (
    <svg width={size} height={size} className="transform -rotate-90 shrink-0">
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke="#F1F3F4"
        strokeWidth={3.5}
      />
      <circle
        cx={size / 2}
        cy={size / 2}
        r={radius}
        fill="none"
        stroke={color}
        strokeWidth={3.5}
        strokeDasharray={circumference}
        strokeDashoffset={offset}
        strokeLinecap="round"
        className="transition-all duration-1000 ease-out"
      />
      <text
        x={size / 2}
        y={size / 2}
        textAnchor="middle"
        dominantBaseline="central"
        className="fill-[#202124] text-[11px] font-bold font-mono tabular-nums"
        transform={`rotate(90, ${size / 2}, ${size / 2})`}
      >
        {value}
      </text>
    </svg>
  );
}

function TreemapContent(props: any) {
  const { x, y, width, height, name, value, index } = props;
  if (width < 45 || height < 32) return null;
  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        rx={6}
        fill={TREEMAP_COLORS[index % TREEMAP_COLORS.length]}
        stroke="#FFFFFF"
        strokeWidth={2}
        className="transition-opacity hover:opacity-90"
      />
      {width > 65 && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 - 5}
            textAnchor="middle"
            className="fill-white text-[11px] font-bold font-display"
            style={{ pointerEvents: 'none' }}
          >
            {name?.length > 18 ? name.substring(0, 16) + '…' : name}
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 11}
            textAnchor="middle"
            className="fill-white/85 text-[10px] font-mono tabular-nums"
            style={{ pointerEvents: 'none' }}
          >
            Score: {value}
          </text>
        </>
      )}
    </g>
  );
}

export function TrendChart({ articles }: { articles: Article[] }) {
  const [trends, setTrends] = useState<TrendData[]>([]);
  const [summary, setSummary] = useState<string | null>(null);
  const [modelUsed, setModelUsed] = useState<string>('gemini-3.8-flash');
  const [loading, setLoading] = useState(false);
  const [analyzed, setAnalyzed] = useState(false);
  const [isMounted, setIsMounted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Automatically synthesize trends when mounted with articles
  useEffect(() => {
    if (isMounted && articles.length > 0 && !analyzed && !loading) {
      analyzeTrends();
    }
  }, [isMounted, articles.length]);

  const analyzeTrends = async () => {
    if (articles.length === 0) return;
    setLoading(true);
    setError(null);

    try {
      const subset = articles.slice(0, 60);
      const titles = subset.map((a) => a.title);
      const snippets = subset.map((a) => a.snippet);
      const sources = subset.map((a) => a.source);

      const res = await fetch('/api/trends', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ titles, snippets, sources }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to synthesize trends');
      }

      const data: TrendResponse = await res.json();
      if (data.trends) {
        setTrends(data.trends);
        setSummary(data.summary || null);
        if (data.modelUsed) setModelUsed(data.modelUsed);
      }
      setAnalyzed(true);
    } catch (err: any) {
      setError(err.message || 'Failed to analyze trends.');
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted) {
    return (
      <div className="h-[250px] flex items-center justify-center">
        <Loader2 className="w-6 h-6 animate-spin text-[#4471ED]" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 bg-white border border-[#DADCE0] rounded-2xl">
        <Loader2 className="w-8 h-8 animate-spin text-[#4471ED] mb-4" />
        <p className="text-sm font-bold text-[#202124] font-display">
          Synthesizing Cross-Lab Research Convergence…
        </p>
        <p className="text-xs text-[#5F6368] mt-1 font-mono">
          Analyzing {articles.length} publications via {modelUsed}
        </p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center bg-white border border-[#DADCE0] rounded-2xl">
        <p className="text-sm text-[#EA4335] mb-4 font-medium">{error}</p>
        <button
          onClick={analyzeTrends}
          className="flex items-center gap-2 px-4 py-2 bg-[#202124] text-white rounded-lg text-xs font-semibold cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5" /> Retry Analysis
        </button>
      </div>
    );
  }

  const radarData = trends.map((t) => ({
    subject: t.name,
    score: t.value,
    fullMark: 100,
  }));
  const treemapData = trends.map((t) => ({ name: t.name, size: t.value }));
  const allLabs = Array.from(new Set(trends.flatMap((t) => t.labs || [])));

  const signalCounts: Record<string, number> = {};
  trends.forEach((t) => {
    signalCounts[t.signal || 'growing'] = (signalCounts[t.signal || 'growing'] || 0) + 1;
  });
  const pieData = Object.entries(signalCounts).map(([signal, count]) => ({
    name: signal,
    value: count,
  }));
  const PIE_COLORS: Record<string, string> = {
    emerging: '#4471ED',
    growing: '#34A853',
    established: '#4285F4',
    declining: '#FBBC04',
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white border border-[#DADCE0] rounded-xl p-5 shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold text-[#202124] font-display">
              Frontier Lab Convergence &amp; Topic Radar
            </h2>
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono bg-[#E8F0FE] text-[#1967D2] font-semibold">
              <Cpu className="w-3 h-3" />
              {modelUsed}
            </span>
          </div>
          <p className="text-xs text-[#5F6368] mt-0.5">
            Quantitative cluster weights across Google DeepMind, Google Research, OpenAI, Anthropic, Meta AI, and Microsoft Research.
          </p>
        </div>

        <button
          onClick={analyzeTrends}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-[#F8F9FA] hover:bg-[#E8F0FE] text-[#202124] border border-[#DADCE0] text-xs font-semibold transition-colors self-start sm:self-center cursor-pointer"
        >
          <RefreshCw className="w-3.5 h-3.5 text-[#4471ED]" />
          <span>Recompute Matrix</span>
        </button>
      </div>

      {/* Row 1: Strategic Executive Briefing Report (FDE Techdoc Callout Style) */}
      {summary && (
        <div className="bg-white border border-[#DADCE0] rounded-xl overflow-hidden shadow-xs">
          <div className="h-1 w-full fde-gradient-divider" />
          <div className="p-6 md:p-8">
            <div className="flex items-center justify-between mb-4 pb-3 border-b border-[#DADCE0]">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-[#4471ED]" />
                <h3 className="text-base font-bold text-[#202124] font-display uppercase tracking-wider">
                  FDE Executive Strategic Synthesis
                </h3>
              </div>
              <span className="text-xs font-mono text-[#5F6368]">
                Google Cloud AI Tech Group · Normative Briefing
              </span>
            </div>
            <div className="prose prose-sm max-w-none text-[#202124] prose-headings:font-display prose-headings:text-[#202124] prose-headings:font-bold prose-p:text-[#5F6368] prose-p:leading-relaxed prose-li:text-[#5F6368] prose-strong:text-[#202124]">
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </div>
        </div>
      )}

      {/* Row 2: Radar + Treemap */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="border-[#DADCE0] bg-white shadow-xs col-span-1">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
              Topic Vector Radar
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <RadarChart cx="50%" cy="50%" outerRadius="70%" data={radarData}>
                <PolarGrid stroke="#DADCE0" />
                <PolarAngleAxis
                  dataKey="subject"
                  tick={{ fontSize: 10, fill: '#202124', fontWeight: 600 }}
                />
                <PolarRadiusAxis angle={30} domain={[0, 100]} tick={false} axisLine={false} />
                <Radar
                  dataKey="score"
                  stroke="#4471ED"
                  fill="#4471ED"
                  fillOpacity={0.22}
                  strokeWidth={2}
                />
              </RadarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="border-[#DADCE0] bg-white shadow-xs col-span-1 lg:col-span-2">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
              Research Investment Landscape (Treemap)
            </CardTitle>
          </CardHeader>
          <CardContent className="pb-4">
            <ResponsiveContainer width="100%" height={260}>
              <Treemap
                data={treemapData}
                dataKey="size"
                nameKey="name"
                content={<TreemapContent />}
              >
                <Tooltip
                  formatter={(value: number) => [`Weight: ${value}`, 'Relevance Index']}
                  contentStyle={{
                    borderRadius: '8px',
                    border: '1px solid #DADCE0',
                    boxShadow: '0 4px 12px rgba(32,33,36,0.12)',
                    fontSize: '12px',
                  }}
                />
              </Treemap>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      </div>

      {/* Row 3: Trend Cards Grid */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display px-1">
          Ranked Frontier Signals
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {trends.map((trend) => (
            <div
              key={trend.name}
              className="bg-white border border-[#DADCE0] rounded-xl p-4 hover:border-[#4471ED] transition-all shadow-xs"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex-1 min-w-0">
                  <h4 className="text-sm font-bold text-[#202124] font-display truncate mb-2">
                    {trend.name}
                  </h4>
                  {trend.signal && <SignalBadge signal={trend.signal} />}
                </div>
                <TrendScoreRing value={trend.value} />
              </div>

              {trend.labs && trend.labs.length > 0 && (
                <div className="flex flex-wrap gap-1.5 mt-3.5 pt-3 border-t border-[#DADCE0]/60">
                  {trend.labs.map((lab) => (
                    <span
                      key={lab}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono font-medium bg-[#F8F9FA] text-[#202124] border border-[#DADCE0]"
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full"
                        style={{ backgroundColor: LAB_COLORS[lab] || '#4471ED' }}
                      />
                      {lab.replace(' Research', '').replace(' AI', '')}
                    </span>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Row 4: Signal Distribution + Lab Convergence Matrix Table (techdoc.css table style) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card className="border-[#DADCE0] bg-white shadow-xs">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
              Maturity Signal Distribution
            </CardTitle>
          </CardHeader>
          <CardContent className="flex items-center justify-center gap-8 py-4">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  cx="50%"
                  cy="50%"
                  innerRadius={42}
                  outerRadius={68}
                  paddingAngle={4}
                  strokeWidth={0}
                >
                  {pieData.map((entry) => (
                    <Cell
                      key={entry.name}
                      fill={PIE_COLORS[entry.name] || '#4471ED'}
                    />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="flex flex-col gap-2.5">
              {pieData.map((entry) => (
                <div key={entry.name} className="flex items-center gap-2.5 text-xs">
                  <span
                    className="w-2.5 h-2.5 rounded-full"
                    style={{ backgroundColor: PIE_COLORS[entry.name] || '#4471ED' }}
                  />
                  <span className="text-[#5F6368] capitalize font-medium">{entry.name}</span>
                  <span className="font-bold text-[#202124] font-mono tabular-nums">
                    {entry.value}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Lab Convergence Matrix Table */}
        <Card className="border-[#DADCE0] bg-white shadow-xs overflow-hidden">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-bold text-[#5F6368] uppercase tracking-wider font-display">
              Cross-Lab Convergence Matrix
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-[#E8F0FE] border-b border-[#DADCE0]">
                    <th className="text-left font-bold text-[#202124] py-2 px-2.5">
                      Frontier Cluster
                    </th>
                    {allLabs.map((lab) => (
                      <th
                        key={lab}
                        className="text-center font-bold text-[#202124] py-2 px-1.5 text-[10px] font-mono"
                      >
                        {lab
                          .replace('Google ', '')
                          .replace(' Research', '')
                          .replace(' AI', '')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#DADCE0]">
                  {trends.slice(0, 6).map((trend) => (
                    <tr key={trend.name} className="hover:bg-[#F8F9FA]">
                      <td className="py-2 px-2.5 font-semibold text-[#202124] truncate max-w-[140px]">
                        {trend.name}
                      </td>
                      {allLabs.map((lab) => {
                        const active = trend.labs?.includes(lab);
                        return (
                          <td key={lab} className="text-center py-2 px-1.5">
                            <span
                              className={`inline-block w-3.5 h-3.5 rounded-xs ${
                                active ? '' : 'bg-[#F1F3F4]'
                              }`}
                              style={
                                active
                                  ? { backgroundColor: LAB_COLORS[lab] || '#4471ED' }
                                  : {}
                              }
                            />
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
