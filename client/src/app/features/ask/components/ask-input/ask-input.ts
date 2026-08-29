import { Component, EventEmitter, Input, Output } from '@angular/core';
import { FormsModule } from '@angular/forms';

import { LensButton } from '../../../../shared/components/lens-button/lens-button';

export type AnalysisMode = 'all' | 'related' | 'deep';

@Component({
  selector: 'app-ask-input',
  imports: [FormsModule, LensButton],
  templateUrl: './ask-input.html',
  styleUrl: './ask-input.css',
})
export class AskInput {
  @Input() value = '';
  @Input() selectedMode: AnalysisMode = 'all';

  @Output() valueChange = new EventEmitter<string>();
  @Output() modeChange = new EventEmitter<AnalysisMode>();
  @Output() submitted = new EventEmitter<void>();

  handleInput(value: string): void {
    this.valueChange.emit(value);
  }

  handleEnter(event: Event): void {
    const keyboardEvent = event as KeyboardEvent;

    if (keyboardEvent.shiftKey) {
      return;
    }

    keyboardEvent.preventDefault();
    this.submitted.emit();
  }

  setMode(mode: AnalysisMode): void {
    this.modeChange.emit(mode);
  }

  submit(): void {
    this.submitted.emit();
  }
}