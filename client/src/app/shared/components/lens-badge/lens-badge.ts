import { Component, Input } from '@angular/core';

export type LensBadgeTone =
  | 'neutral'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger';

@Component({
  selector: 'app-lens-badge',
  standalone: true,
  templateUrl: './lens-badge.html',
  styleUrl: './lens-badge.css',
})
export class LensBadge {
  @Input() tone: LensBadgeTone = 'neutral';
  @Input() pill = false;
}