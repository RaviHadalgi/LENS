import { Component, Input, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-suggestion-card',
  imports: [],
  templateUrl: './suggestion-card.html',
  styleUrl: './suggestion-card.css',
})
export class SuggestionCard {
  @Input({ required: true }) title!: string;
  @Input() description = '';

  @Output() selected = new EventEmitter<void>();

  select(): void {
    this.selected.emit();
  }
}