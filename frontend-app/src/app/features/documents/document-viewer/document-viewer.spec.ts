import { signal } from '@angular/core';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { of } from 'rxjs';
import { vi } from 'vitest';
import { AuthService } from '../../../core/services/auth.service';
import { DocumentViewerPage } from './document-viewer';

const { renderAsyncMock } = vi.hoisted(() => ({
  renderAsyncMock: vi.fn<(buffer: ArrayBuffer, container: HTMLElement) => Promise<void>>(),
}));

vi.mock('docx-preview', () => ({
  renderAsync: renderAsyncMock,
}));

const DOCX_URL = '/api/files/tai-lieu.docx';
const PDF_URL = '/api/files/tai-lieu.pdf';
const ROLE_CASES = [
  { role: 'ADMIN', isAdmin: true, href: '/admin/documents', label: '← Về hàng chờ duyệt' },
  { role: 'USER', isAdmin: false, href: '/documents', label: '← Về danh sách' },
];

const createObjectURLMock = vi.fn<(blob: Blob) => string>(() => 'blob:mock-file');

function setupViewer(isAdmin: boolean, src = DOCX_URL, name = 'tai-lieu.docx') {
  TestBed.configureTestingModule({
    imports: [DocumentViewerPage],
    providers: [
      provideRouter([]),
      provideHttpClient(),
      provideHttpClientTesting(),
      {
        provide: ActivatedRoute,
        useValue: { queryParamMap: of(convertToParamMap({ src, name })) },
      },
      { provide: AuthService, useValue: { isAdmin: signal(isAdmin) } },
    ],
  });

  const fixture = TestBed.createComponent(DocumentViewerPage);
  fixture.detectChanges();

  return { fixture, http: TestBed.inject(HttpTestingController) };
}

function flushFile(http: HttpTestingController, url: string): void {
  http.expectOne(url).flush(new ArrayBuffer(8));
}

describe('DocumentViewerPage', () => {
  beforeEach(() => {
    renderAsyncMock.mockReset();
    renderAsyncMock.mockResolvedValue(undefined);
    createObjectURLMock.mockClear();
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURLMock,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
  });

  it('leaves the loading state once a DOCX buffer arrives and renders it', async () => {
    let finishRender!: () => void;
    renderAsyncMock.mockReturnValue(
      new Promise<void>((resolve) => {
        finishRender = resolve;
      }),
    );

    const { fixture, http } = setupViewer(false);
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Đang tải tệp…');

    flushFile(http, DOCX_URL);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element.textContent).not.toContain('Đang tải tệp…');
    expect(renderAsyncMock).toHaveBeenCalledTimes(1);

    const [, host] = renderAsyncMock.mock.calls[0];
    expect(element.contains(host)).toBe(true);

    finishRender();
    await Promise.resolve();
  });

  it.each(ROLE_CASES)('renders a PDF for $role and links back to $href', async ({ isAdmin, href, label }) => {
    const { fixture, http } = setupViewer(isAdmin, PDF_URL, 'tai-lieu.pdf');
    const element = fixture.nativeElement as HTMLElement;
    expect(element.textContent).toContain('Đang tải tệp…');

    flushFile(http, PDF_URL);
    fixture.detectChanges();
    await fixture.whenStable();

    expect(element.textContent).not.toContain('Đang tải tệp…');
    expect(renderAsyncMock).not.toHaveBeenCalled();

    const blob = createObjectURLMock.mock.calls[0][0];
    expect(blob.type).toBe('application/pdf');

    const iframe = element.querySelector('iframe');
    expect(iframe?.src).toContain('blob:mock-file');

    const backLink = element.querySelector('a') as HTMLAnchorElement;
    expect(backLink.getAttribute('href')).toBe(href);
    expect(backLink.textContent?.trim()).toBe(label);
  });

  it.each(ROLE_CASES)('links $role back to $href for DOCX', ({ isAdmin, href, label }) => {
    const { fixture, http } = setupViewer(isAdmin);
    flushFile(http, DOCX_URL);
    fixture.detectChanges();

    const backLink = fixture.nativeElement.querySelector('a') as HTMLAnchorElement;
    expect(backLink.getAttribute('href')).toBe(href);
    expect(backLink.textContent?.trim()).toBe(label);
  });
});
