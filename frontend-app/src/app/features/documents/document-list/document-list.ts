import { DatePipe } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  OnInit,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { ActivatedRoute, ParamMap, Router } from '@angular/router';
import { Subject, debounceTime, distinctUntilChanged } from 'rxjs';
import {
  DocumentSummary,
  PaginationMeta,
  Subject as SubjectModel,
} from '../../../core/models';
import { DocumentService } from '../../../core/services/document.service';
import { SubjectService } from '../../../core/services/subject.service';
import { getApiErrorMessages } from '../../../core/utils/api-error.util';
import { fileExtension, initials } from '../../../core/utils/format.util';

const PAGE_SIZE = 12;
const DEFAULT_SORT = 'createdAt:desc';

type SortValue = 'createdAt:desc' | 'viewCount:desc' | 'ratingAvg:desc';

function toggleValue(list: string[], value: string): string[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value];
}

/**
 * Danh sách tài liệu đã duyệt.
 * Bộ lọc (từ khoá, môn học, loại file, sắp xếp, trang) sống trên URL nên
 * gửi link cho người khác là mở ra đúng kết quả, và nút Back hoạt động đúng.
 */
@Component({
  selector: 'app-document-list',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DatePipe],
  templateUrl: './document-list.html',
  styleUrl: './document-list.css',
})
export class DocumentList implements OnInit {
  private readonly documentsApi = inject(DocumentService);
  private readonly subjectsApi = inject(SubjectService);
  private readonly router = inject(Router);
  private readonly route = inject(ActivatedRoute);
  private readonly destroyRef = inject(DestroyRef);
  private readonly host = inject(ElementRef<HTMLElement>);
  private readonly keywordInput = new Subject<string>();
  private readonly subjectStrip = viewChild<ElementRef<HTMLElement>>('subjectStrip');
  private subjectDrag: {
    pointerId: number;
    startX: number;
    startScrollLeft: number;
    moved: boolean;
  } | null = null;
  private suppressSubjectClick = false;

  protected readonly items = signal<DocumentSummary[]>([]);
  protected readonly meta = signal<PaginationMeta>({
    page: 1,
    limit: PAGE_SIZE,
    total: 0,
    totalPages: 0,
  });
  protected readonly loading = signal(true);
  protected readonly errors = signal<string[]>([]);
  protected readonly subjects = signal<SubjectModel[]>([]);
  protected readonly keyword = signal('');
  protected readonly selectedSubjects = signal<string[]>([]);
  protected readonly selectedFileTypes = signal<string[]>([]);
  protected readonly sort = signal<SortValue>(DEFAULT_SORT);
  protected readonly sortOpen = signal(false);

  protected readonly fileTypes = [
    { value: 'pdf', label: 'PDF' },
    { value: 'docx', label: 'DOCX' },
    { value: 'pptx', label: 'PPTX' },
  ];

  protected readonly sortOptions: { value: SortValue; label: string }[] = [
    { value: 'createdAt:desc', label: 'Mới nhất' },
    { value: 'viewCount:desc', label: 'Nhiều lượt xem' },
    { value: 'ratingAvg:desc', label: 'Đánh giá cao' },
  ];

  protected readonly currentSortLabel = computed(
    () => this.sortOptions.find((option) => option.value === this.sort())?.label ?? 'Mới nhất',
  );

  protected readonly hasFilters = computed(
    () =>
      this.keyword().trim().length > 0 ||
      this.selectedSubjects().length > 0 ||
      this.selectedFileTypes().length > 0,
  );

  protected readonly rangeLabel = computed(() => {
    const meta = this.meta();
    if (meta.total === 0) {
      return '0 tài liệu';
    }

    const from = (meta.page - 1) * meta.limit + 1;
    const to = Math.min(meta.page * meta.limit, meta.total);
    return `${from}–${to} trong ${meta.total} tài liệu`;
  });

  /** Tối đa 5 số trang quanh trang hiện tại. */
  protected readonly pages = computed(() => {
    const { page, totalPages } = this.meta();
    const start = Math.max(1, Math.min(page - 2, totalPages - 4));
    const end = Math.min(totalPages, start + 4);
    return Array.from({ length: Math.max(0, end - start + 1) }, (_, index) => start + index);
  });

  constructor() {
    this.keywordInput
      .pipe(debounceTime(350), distinctUntilChanged(), takeUntilDestroyed())
      .subscribe((keyword) => this.applyFilters({ keyword, page: 1 }));
  }

  ngOnInit(): void {
    this.subjectsApi
      .list()
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (subjects) => this.subjects.set(subjects),
        error: () => this.subjects.set([]),
      });

    // URL là nguồn dữ liệu duy nhất cho bộ lọc.
    this.route.queryParamMap
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((params) => {
        this.readFilters(params);
        this.fetch(params);
      });
  }

  protected onKeywordInput(event: Event): void {
    const value = (event.target as HTMLInputElement).value;
    this.keyword.set(value);
    this.keywordInput.next(value);
  }

  protected clearKeyword(): void {
    this.keyword.set('');
    this.keywordInput.next('');
  }

  protected startSubjectDrag(event: PointerEvent): void {
    if (event.button !== 0) {
      return;
    }

    const strip = this.subjectStrip()?.nativeElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) {
      return;
    }

    this.subjectDrag = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startScrollLeft: strip.scrollLeft,
      moved: false,
    };
  }

  protected moveSubjectDrag(event: PointerEvent): void {
    const drag = this.subjectDrag;
    const strip = this.subjectStrip()?.nativeElement;
    if (!drag || !strip || drag.pointerId !== event.pointerId) {
      return;
    }

    const distance = event.clientX - drag.startX;
    if (!drag.moved && Math.abs(distance) > 4) {
      drag.moved = true;
      strip.setPointerCapture(event.pointerId);
      strip.classList.add('is-dragging');
    }

    if (drag.moved) {
      event.preventDefault();
      strip.scrollLeft = drag.startScrollLeft - distance;
    }
  }

  protected endSubjectDrag(event: PointerEvent): void {
    const drag = this.subjectDrag;
    const strip = this.subjectStrip()?.nativeElement;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }

    if (strip?.hasPointerCapture(event.pointerId)) {
      strip.releasePointerCapture(event.pointerId);
    }
    strip?.classList.remove('is-dragging');
    this.subjectDrag = null;

    if (drag.moved) {
      // Chặn cú click phát sinh sau khi kéo, để không vô tình chọn môn học.
      this.suppressSubjectClick = true;
      window.setTimeout(() => (this.suppressSubjectClick = false), 80);
    }
  }

  protected toggleSubject(subjectId: string): void {
    if (this.suppressSubjectClick) {
      return;
    }

    const next = toggleValue(this.selectedSubjects(), subjectId);
    this.selectedSubjects.set(next);
    this.applyFilters({ subjectIds: next, page: 1 });
  }

  protected toggleFileType(fileType: string): void {
    const next = toggleValue(this.selectedFileTypes(), fileType);
    this.selectedFileTypes.set(next);
    this.applyFilters({ fileTypes: next, page: 1 });
  }

  protected toggleSortMenu(): void {
    this.sortOpen.update((open) => !open);
  }

  protected closeSortMenu(): void {
    this.sortOpen.set(false);
  }

  protected chooseSort(value: SortValue): void {
    this.sortOpen.set(false);
    if (this.sort() === value) {
      return;
    }

    this.sort.set(value);
    this.applyFilters({ sort: value, page: 1 });
  }

  protected clearFilters(): void {
    this.keyword.set('');
    this.selectedSubjects.set([]);
    this.selectedFileTypes.set([]);
    this.sort.set(DEFAULT_SORT);
    void this.router.navigate([], {
      relativeTo: this.route,
      queryParams: {},
      replaceUrl: true,
    });
  }

  protected goToPage(page: number): void {
    const meta = this.meta();
    if (page < 1 || page > meta.totalPages || page === meta.page) {
      return;
    }

    this.scrollToTop();
    this.applyFilters({ page });
  }

  protected badge(item: DocumentSummary): string {
    return fileExtension(item.files[0]?.name ?? '');
  }

  protected authorInitials(fullName: string): string {
    return initials(fullName);
  }

  private readFilters(params: ParamMap): void {
    this.keyword.set(params.get('keyword') ?? '');
    this.selectedSubjects.set(params.getAll('subjectIds'));
    this.selectedFileTypes.set(params.getAll('fileTypes'));

    const sort = params.get('sort');
    this.sort.set(sort === 'viewCount:desc' || sort === 'ratingAvg:desc' ? sort : DEFAULT_SORT);
  }

  /** Ghi bộ lọc lên URL; subscription queryParamMap sẽ tải lại danh sách. */
  private applyFilters(overrides: {
    keyword?: string;
    subjectIds?: string[];
    fileTypes?: string[];
    sort?: SortValue;
    page?: number;
  }): void {
    const keyword = (overrides.keyword ?? this.keyword()).trim();
    const subjectIds = overrides.subjectIds ?? this.selectedSubjects();
    const fileTypes = overrides.fileTypes ?? this.selectedFileTypes();
    const sort = overrides.sort ?? this.sort();
    const page = overrides.page ?? this.meta().page;

    void this.router.navigate([], {
      relativeTo: this.route,
      replaceUrl: true,
      queryParams: {
        keyword: keyword.length > 0 ? keyword : null,
        subjectIds: subjectIds.length > 0 ? subjectIds : null,
        fileTypes: fileTypes.length > 0 ? fileTypes : null,
        sort: sort === DEFAULT_SORT ? null : sort,
        page: page > 1 ? page : null,
      },
    });
  }

  private fetch(params: ParamMap): void {
    const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
    this.loading.set(true);
    this.errors.set([]);

    this.documentsApi
      .list({
        keyword: this.keyword().trim() || undefined,
        subjectIds: this.selectedSubjects(),
        fileTypes: this.selectedFileTypes(),
        sort: this.sort(),
        page,
        limit: PAGE_SIZE,
      })
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe({
        next: (result) => {
          // URL trỏ quá số trang hiện có (ví dụ sau khi xoá bớt tài liệu).
          if (
            result.items.length === 0 &&
            result.meta.total > 0 &&
            result.meta.page > result.meta.totalPages
          ) {
            this.loading.set(false);
            this.applyFilters({ page: result.meta.totalPages });
            return;
          }

          this.items.set(result.items);
          this.meta.set(result.meta);
          this.loading.set(false);
        },
        error: (error: unknown) => {
          this.items.set([]);
          this.meta.set({ page, limit: PAGE_SIZE, total: 0, totalPages: 0 });
          this.errors.set(getApiErrorMessages(error));
          this.loading.set(false);
        },
      });
  }

  private scrollToTop(): void {
    const scroller = (this.host.nativeElement as HTMLElement).closest('.app-main');
    scroller?.scrollTo({ top: 0, behavior: 'smooth' });
  }
}
