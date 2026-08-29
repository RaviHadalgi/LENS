import { Component, Input } from '@angular/core';

import { LensBadge } from '../../../../shared/components/lens-badge/lens-badge';

export interface LensSource {
  creator: string;
  perspective: string;
  context: string;
  statement: string;
  timestamp: string;
}

@Component({
  selector: 'app-source-perspective-card',
  imports: [LensBadge],
  templateUrl: './source-perspective-card.html',
  styleUrl: './source-perspective-card.css',
})
export class SourcePerspectiveCard {
  @Input({ required: true }) source!: LensSource;
}