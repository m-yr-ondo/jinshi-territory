import type { LeaderboardEntry } from '@jinshi-territory/shared';

export class Leaderboard {
  constructor(private readonly element: HTMLElement) {}

  render(entries: LeaderboardEntry[], selfId: string): void {
    this.element.innerHTML = '<h2>Territory</h2>';
    entries.forEach((entry, index) => {
      const row = document.createElement('div');
      row.className = `leader-row${entry.id === selfId ? ' self' : ''}`;
      row.innerHTML = `<span>${index + 1}</span><span>${escapeHtml(entry.name)}${entry.kind === 'bot' ? ' 🤖' : ''}</span><span class="score">${entry.percentage.toFixed(1)}%</span>`;
      this.element.append(row);
    });
  }
}

function escapeHtml(value: string): string {
  const node = document.createElement('span');
  node.textContent = value;
  return node.innerHTML;
}
