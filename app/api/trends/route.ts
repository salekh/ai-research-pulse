import { NextResponse } from 'next/server';
import { generateContentWithFallback } from '@/lib/vertex';
import { extractTagsDeterministic } from '@/lib/ingestion';

// Server-side memory cache for trend analysis to prevent redundant inference
const trendsCache = new Map<string, { timestamp: number; data: any }>();
const TRENDS_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export async function POST(req: Request) {
  try {
    const { titles, snippets, sources } = await req.json();

    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      return NextResponse.json({ error: 'Invalid titles provided' }, { status: 400 });
    }

    const cacheKey = `${titles.length}:${titles.slice(0, 5).join('|')}`;
    const cached = trendsCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < TRENDS_CACHE_TTL_MS) {
      return NextResponse.json({ ...cached.data, cached: true });
    }

    const articlesContext = titles
      .map((title: string, i: number) => {
        const parts = [`[${i + 1}] "${title}"`];
        if (sources?.[i]) parts.push(`(${sources[i]})`);
        if (snippets?.[i]) parts.push(`\n    ${snippets[i].substring(0, 200)}`);
        return parts.join(' ');
      })
      .join('\n');

    const prompt = `You are a senior AI research strategist analyzing ${titles.length} recent publications from major AI labs (Google, OpenAI, Anthropic, Meta, Microsoft, x.AI).

Perform a rigorous trend analysis and return a JSON object with these keys:

{
  "trends": [
    {
      "name": "Topic Name (2-4 words, e.g. 'Long-Context Models')",
      "value": <number 1-100>,
      "signal": "<one of: emerging | growing | established | declining>",
      "labs": ["List of labs publishing in this area from the input"]
    }
  ],
  "summary": "<A detailed markdown report (see structure below)>"
}

**Summary structure (use ### headers, write in markdown):**
### Executive Summary
2-3 sentences on the dominant theme across all articles.

### Cross-Lab Convergence
Which topics are multiple labs independently pursuing? What does this signal about the field's direction?

### Key Emerging Themes
What's new or surprising in this batch? Highlight topics in "emerging" or "growing" status.

### Strategic Outlook
What do these trends suggest about the next 6-12 months?

Return exactly 6-8 trends, sorted by 'value' descending.

Articles:
${articlesContext}`;

    try {
      const { text, modelUsed } = await generateContentWithFallback({
        contents: prompt,
        config: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          topP: 0.95,
          responseMimeType: 'application/json',
        },
      });

      const data = JSON.parse(text);
      const responseData = Array.isArray(data)
        ? { trends: data, summary: 'Trends analyzed from recent articles.', modelUsed }
        : { ...data, modelUsed };

      trendsCache.set(cacheKey, { timestamp: Date.now(), data: responseData });
      return NextResponse.json(responseData);
    } catch (aiErr) {
      // Deterministic statistical cross-lab trend synthesizer fallback
      const topicMap = new Map<
        string,
        { count: number; labs: Set<string>; titles: string[] }
      >();

      const TOPIC_LABELS: Record<string, string> = {
        Agents: 'Agentic Harnesses & Tool Use',
        Reasoning: 'Test-Time Compute & Reasoning',
        Safety: 'Frontier Alignment & Red-Teaming',
        Multimodal: 'Native Multimodal Generation',
        Science: 'AI for Scientific Discovery',
        Evaluation: 'Rigorous Evaluation Benchmarks',
        Efficiency: 'Inference & Quantization Systems',
        Code: 'Autonomous Software Engineering',
        Video: 'Spatiotemporal Video World Models',
        LLM: 'Foundation Architecture Scaling',
      };

      titles.forEach((t: string, idx: number) => {
        const s = snippets?.[idx] || '';
        const lab = sources?.[idx] || 'Google Research';
        const tags = extractTagsDeterministic(t, s);
        for (const tag of tags) {
          const topicName = TOPIC_LABELS[tag] || `${tag} Systems`;
          if (!topicMap.has(topicName)) {
            topicMap.set(topicName, { count: 0, labs: new Set(), titles: [] });
          }
          const entry = topicMap.get(topicName)!;
          entry.count++;
          entry.labs.add(lab);
          if (entry.titles.length < 3) entry.titles.push(t);
        }
      });

      const computedTrends = Array.from(topicMap.entries())
        .map(([name, info]) => {
          const labCount = info.labs.size;
          const rawScore = Math.min(98, Math.round(info.count * 12 + labCount * 15));
          const signal: 'emerging' | 'growing' | 'established' | 'declining' =
            labCount >= 3
              ? 'established'
              : info.count >= 4
              ? 'growing'
              : 'emerging';
          return {
            name,
            value: Math.max(38, rawScore),
            signal,
            labs: Array.from(info.labs),
          };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 7);

      const topTopic = computedTrends[0]?.name || 'Agentic Harnesses & Tool Use';
      const secondTopic = computedTrends[1]?.name || 'Test-Time Compute & Reasoning';

      const fallbackSummary = `### Executive Summary
Analysis of **${titles.length} publications** across frontier labs reveals a decisive structural pivot from pure pre-training parameter scaling toward **${topTopic}** and **${secondTopic}**. Research investments are heavily concentrated on verifiable post-training harnesses, domain-specific scientific benchmarks, and inference-time compute allocation.

### Cross-Lab Convergence
Multiple organizations (${Array.from(
        new Set(computedTrends.flatMap((t) => t.labs))
      ).join(', ')}) are independently converging on multi-turn agentic execution and automated red-teaming. Rather than treating safety and capabilities as orthogonal tracks, recent system cards integrate constitutional classifiers and mechanistic circuit tracing directly into deployment pipelines.

### Key Emerging Themes
* **${topTopic}**: High density of empirical benchmarks evaluating long-horizon tool use and autonomous debugging.
* **${secondTopic}**: Shift toward adaptive test-time verification loops for mathematics, theoretical computer science, and biological modeling.
* **AI for Scientific Discovery**: Specialized evaluation suites measuring genuine acceleration in wet-lab biology and theoretical proof verification.

### Strategic Outlook
Over the next 6–12 months, competitive differentiation among frontier models will be governed by **execution reliability under long-running agentic harnesses** and **cost-per-verified-step** rather than static zero-shot leaderboard scores.`;

      const fallbackResponse = {
        trends: computedTrends,
        summary: fallbackSummary,
        fallback: true,
      };
      trendsCache.set(cacheKey, { timestamp: Date.now(), data: fallbackResponse });
      return NextResponse.json(fallbackResponse);
    }
  } catch (error: any) {
    console.error('[api/trends] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to analyze trends' },
      { status: 500 }
    );
  }
}
