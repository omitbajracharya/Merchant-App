import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection } from '@angular/core';
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { of, throwError } from 'rxjs';
import { ApplicationWizard } from './application-wizard';
import { ApplicationService } from '../../core/services/application.service';

/**
 * Tests the custom 9-digit routing number validator, RxJS debounced auto-save, and state preservation on API failure.
 */
describe('ApplicationWizard', () => {
  let appServiceMock: {
    createDraft: ReturnType<typeof vi.fn>;
    saveDraft: ReturnType<typeof vi.fn>;
    getById: ReturnType<typeof vi.fn>;
    submitApplication: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    vi.useFakeTimers();

    appServiceMock = {
      createDraft: vi.fn().mockReturnValue(of({ application: { id: 'draft-123', current_step: 1 } })),
      saveDraft: vi.fn().mockReturnValue(of({ application: { id: 'draft-123' } })),
      getById: vi.fn(),
      submitApplication: vi.fn(),
    };

    TestBed.configureTestingModule({
      imports: [ApplicationWizard],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: ApplicationService, useValue: appServiceMock },
      ],
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('validates 9-digit routing number with custom validator', () => {
    const fixture = TestBed.createComponent(ApplicationWizard);
    const comp = fixture.componentInstance;

    comp.form.controls.routing_number.setValue('12345');
    expect(comp.form.controls.routing_number.errors).toEqual({ invalidRouting: true });

    comp.form.controls.routing_number.setValue('021000021');
    expect(comp.form.controls.routing_number.errors).toBeNull();
  });

  it('debounces auto-save and preserves form state if save fails', () => {
    appServiceMock.saveDraft.mockReturnValue(throwError(() => new Error('Network error')));

    const fixture = TestBed.createComponent(ApplicationWizard);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    comp.form.controls.business_name.setValue('Acme Coffee LLC');

    // Before 800ms debounce, saveDraft should not have been called
    vi.advanceTimersByTime(400);
    expect(appServiceMock.saveDraft).not.toHaveBeenCalled();

    // After 800ms debounce, saveDraft triggers and handles error gracefully
    vi.advanceTimersByTime(500);
    expect(appServiceMock.saveDraft).toHaveBeenCalledTimes(1);
    expect(comp.saveStatus()).toBe('error');
    expect(comp.form.controls.business_name.value).toBe('Acme Coffee LLC');
  });
});