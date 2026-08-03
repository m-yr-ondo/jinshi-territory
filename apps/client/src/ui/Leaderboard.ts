import type { LeaderboardEntry } from '@jinshi-territory/shared';

export class Leaderboard {
  constructor(private readonly element: HTMLElement) {}

  render(entries: LeaderboardEntry[], selfId: string): void {
    this.element.replaceChildren();
    entries.slice(0, 5).forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = `leader-row${entry.id === selfId ? ' self' : ''}`;
      row.style.setProperty('--leader-color', `#${entry.color.toString(16).padStart(6, '0')}`);
      row.innerHTML = `<span class="rank">${index + 1}</span><span class="score">${entry.percentage.toFixed(1)}%</span><span class="leader-name">${escapeHtml(entry.name)}</span>`;
      this.element.append(row);
    });
  }
}

function escapeHtml(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}
