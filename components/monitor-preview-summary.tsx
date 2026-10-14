import type { MonitorPreviewSummary, PreviewCounts } from "@/lib/monitor-preview-summary";
import "./monitor-preview-summary.css";

function Counts({ counts }: { counts: PreviewCounts }) {
  return <>
    <span className="monitor-preview-count monitor-preview-count-live"><b>{counts.previewing}</b> previewing</span>
    <span className="monitor-preview-count monitor-preview-count-unavailable"><b>{counts.unavailable}</b> unavailable</span>
    {!!counts.checking && <span className="monitor-preview-count monitor-preview-count-checking"><b>{counts.checking}</b> checking</span>}
    {!!counts.unsupported && <span className="monitor-preview-count monitor-preview-count-other" title="These preview providers cannot be checked automatically."><b>{counts.unsupported}</b> unverified</span>}
  </>;
}

export default function MonitorPreviewStatus({ summary, byCountry }: { summary?: MonitorPreviewSummary; byCountry: boolean }) {
  if (!summary) return <div className="monitor-preview-summary"><span className="monitor-preview-count monitor-preview-count-checking">Checking previews…</span></div>;
  return <div className="monitor-preview-summary" aria-label="Selected screens preview status">
    {byCountry && summary.countries.length ? summary.countries.map(country => <div className="monitor-preview-country" key={country.id} aria-label={`${country.name}: ${country.counts.total} ${country.counts.total === 1 ? "screen" : "screens"}`}>
      <strong className="monitor-preview-country-name" title={country.name}>{country.shortName || country.name}</strong><Counts counts={country.counts}/>
    </div>) : <div className="monitor-preview-country"><Counts counts={summary.counts}/></div>}
  </div>;
}
