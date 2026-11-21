import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideZonelessChangeDetection, signal } from '@angular/core';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { of } from 'rxjs';
import { ApplicationDetail } from './application-detail';
import { ApplicationService } from '../../core/services/application.service';
import { AuthService } from '../../core/auth/auth.service';
import { UserRole } from '../../core/models/auth.model';

describe('ApplicationDetail (Permission-Aware UI)', () => {
  let currentRole: ReturnType<typeof signal<UserRole>>;

  const mockApp = {
    id: 'app-1',
    application_number: 'APP-2026-0001',
    status: 'IN_REVIEW',
    business_name: 'Summit Coffee LLC',
    owner_tax_id_masked: '***-**-1234',
    account_number_masked: '****6789',
    assigned_reviewer_id: null,
  };

  beforeEach(() => {
    currentRole = signal<UserRole>('SALES');

    TestBed.configureTestingModule({
      imports: [ApplicationDetail],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        {
          provide: ApplicationService,
          useValue: {
            getById: vi.fn().mockReturnValue(of({ application: mockApp, reviews: [] })),
            getReviewers: vi.fn().mockReturnValue(of({ reviewers: [] })),
          },
        },
        {
          provide: AuthService,
          useValue: {
            isAdmin: () => currentRole() === 'ADMIN',
            hasRole: (roles: UserRole[]) => roles.includes(currentRole()),
          },
        },
      ],
    });
  });

  it('hides reviewer controls and Reveal buttons from SALES users', () => {
    currentRole.set('SALES');
    const fixture = TestBed.createComponent(ApplicationDetail);
    fixture.componentRef.setInput('id', 'app-1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('***-**-1234');
    expect(text).not.toContain('Record Risk Decision');
    expect(text).not.toContain('Reveal');
  });

  it('shows reviewer controls and Reveal buttons to REVIEWER users', () => {
    currentRole.set('REVIEWER');
    const fixture = TestBed.createComponent(ApplicationDetail);
    fixture.componentRef.setInput('id', 'app-1');
    fixture.detectChanges();

    const text = fixture.nativeElement.textContent as string;
    expect(text).toContain('Record Risk Decision');
    expect(text).toContain('Reveal');
  });
});