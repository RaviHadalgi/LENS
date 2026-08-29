import { Component, Input } from '@angular/core';

@Component({
  selector: 'app-lens-card',
  standalone: true,
  templateUrl: './lens-card.html',
  styleUrl: './lens-card.css',
})
export class LensCard {
  @Input() padding: 'small' | 'medium' | 'large' = 'medium';
  @Input() interactive = false;
}