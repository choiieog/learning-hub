import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  Directive,
  ElementRef,
  OnDestroy,
  OnInit,
  afterNextRender,
  inject,
  signal,
  viewChildren,
} from '@angular/core';
import { RouterLink } from '@angular/router';
import { AuthService } from '../../../core/services/auth.service';

/**
 * Hiện dần phần tử khi cuộn tới (IntersectionObserver).
 *
 * Phần tử mang class `reveal` trong template (để không bị nháy nội dung) và directive chỉ
 * thêm `is-in` một lần khi nó vào khung nhìn. Người bật giảm chuyển động thấy nội dung ngay.
 */
@Directive({ selector: '[appReveal]' })
export class RevealOnScroll implements OnInit, OnDestroy {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private observer: IntersectionObserver | null = null;

  ngOnInit(): void {
    const element = this.host.nativeElement;

    if (
      typeof IntersectionObserver === 'undefined' ||
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    ) {
      element.classList.add('is-in');
      return;
    }

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            element.classList.add('is-in');
            this.observer?.disconnect();
          }
        }
      },
      { threshold: 0.12, rootMargin: '0px 0px -8% 0px' },
    );

    this.observer.observe(element);
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
  }
}

interface SampleDocument {
  type: 'PDF' | 'DOCX' | 'PPTX';
  title: string;
  subject: string;
}

interface Feature {
  title: string;
  body: string;
  cta: string;
  link: string;
}

/**
 * Trang chủ công khai — điểm vào cho khách chưa đăng nhập.
 *
 * Bố cục lấy từ spec Teal Treasury (hero nhiều lớp, device mockup, dải 3 cột, feature
 * stage sticky đổi scene theo IntersectionObserver, coverage card, FAQ dạng rows, CTA
 * glow và footer wordmark) nhưng chuyển sang ngữ cảnh thư viện tài liệu: mockup là
 * giao diện thư viện, scene là tìm / đọc / chia sẻ, coverage card nói về quyền truy cập
 * tệp. Toàn bộ dữ liệu minh hoạ là tĩnh, không gọi API để trang mở được cả khi backend
 * chưa chạy.
 *
 * Bảng màu: trắng #FFFFFF, sương #C8DCDE, marine #8FC4C8, mực #0E2A32.
 * Chuyển động: hiện dần khi cuộn, header đổi nền, mockup trôi nhẹ và scene sticky đổi
 * theo panel đang đọc — tất cả tắt khi người dùng bật giảm chuyển động.
 */
@Component({
  selector: 'app-landing',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RouterLink, RevealOnScroll],
  templateUrl: './landing.html',
  styleUrl: './landing.css',
})
export class Landing {
  protected readonly auth = inject(AuthService);
  protected readonly year = new Date().getFullYear();

  protected readonly scrolled = signal(false);
  protected readonly parallax = signal(0);
  protected readonly activeScene = signal(0);

  private readonly scenePanels = viewChildren<ElementRef<HTMLElement>>('scenePanel');
  private readonly destroyRef = inject(DestroyRef);

  constructor() {
    afterNextRender(() => {
      if (typeof window === 'undefined') {
        return;
      }

      const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
      let frame = 0;

      const update = (): void => {
        frame = 0;
        const top = window.scrollY;

        this.scrolled.set(top > 12);
        this.parallax.set(reducedMotion.matches ? 0 : Math.min(24, top * 0.05));
      };

      const onScroll = (): void => {
        if (!frame) {
          frame = window.requestAnimationFrame(update);
        }
      };

      window.addEventListener('scroll', onScroll, { passive: true });
      update();

      let observer: IntersectionObserver | null = null;

      // Mobile xếp stage và panel theo chiều dọc (stage không sticky), nên giữ stage ở
      // scene đầu; chỉ desktop mới đổi scene theo panel đang đọc.
      if (
        typeof IntersectionObserver !== 'undefined' &&
        window.matchMedia('(min-width: 1024px)').matches
      ) {
        observer = new IntersectionObserver(
          (entries) => {
            for (const entry of entries) {
              if (entry.isIntersecting) {
                const index = Number((entry.target as HTMLElement).dataset['sceneIndex']);
                if (Number.isFinite(index)) {
                  this.activeScene.set(index);
                }
              }
            }
          },
          { rootMargin: '-36% 0px -46% 0px', threshold: 0 },
        );

        for (const panel of this.scenePanels()) {
          observer.observe(panel.nativeElement);
        }
      }

      this.destroyRef.onDestroy(() => {
        window.removeEventListener('scroll', onScroll);
        observer?.disconnect();

        if (frame) {
          window.cancelAnimationFrame(frame);
        }
      });
    });
  }

  protected readonly sampleDocuments: SampleDocument[] = [
    { type: 'PDF', title: 'Đề cương ôn tập Giải tích 1', subject: 'MAT1203 · Giải tích 1' },
    { type: 'DOCX', title: 'Kế thừa và đa hình trong OOP', subject: 'INT2204 · Lập trình hướng đối tượng' },
    { type: 'PPTX', title: 'Đề thi giữa kỳ CNPM 2024', subject: 'INT2208 · Công nghệ phần mềm' },
  ];

  protected readonly formats = [
    { name: 'PDF', description: 'Bài giảng, đề cương và đề thi — mở đọc ngay trên web.' },
    { name: 'DOCX', description: 'Ghi chú, bài tập và tài liệu soạn thảo của từng môn.' },
    { name: 'PPTX', description: 'Slide thuyết trình, tài liệu ôn tập theo buổi học.' },
  ];

  protected readonly features: Feature[] = [
    {
      title: 'Tìm đúng môn, đúng tài liệu.',
      body: 'Lọc theo môn, người đăng và loại tệp. Bộ lọc nằm trên URL, nên gửi link cho bạn cùng lớp là mở ra đúng kết quả đó.',
      cta: 'Xem thư viện tài liệu',
      link: '/documents',
    },
    {
      title: 'Đọc ngay, không rời trang.',
      body: 'PDF và DOCX mở trong trình đọc của Learning Hub. Tệp thuyết trình vẫn có nút tải về khi bạn cần mở bằng PowerPoint.',
      cta: 'Mở một tài liệu',
      link: '/documents',
    },
    {
      title: 'Chia sẻ một lần, dùng về sau.',
      body: 'Tải tệp lên, chọn môn và viết mô tả ngắn. Tài liệu nằm cùng chỗ với tài liệu của cả lớp và tìm lại được bằng từ khoá.',
      cta: 'Đăng tài liệu đầu tiên',
      link: '/auth/register',
    },
  ];

  protected readonly subjects = [
    { code: 'MAT1203', name: 'Giải tích 1' },
    { code: 'MAT1093', name: 'Đại số tuyến tính' },
    { code: 'INT2204', name: 'Lập trình hướng đối tượng' },
    { code: 'INT2208', name: 'Công nghệ phần mềm' },
    { code: 'PHY1100', name: 'Vật lý đại cương 1' },
  ];

  protected readonly privacyPoints = [
    {
      icon: 'lock' as const,
      title: 'Chỉ mở khi đã đăng nhập',
      body: 'Mỗi lượt mở tệp đều kiểm tra phiên của bạn — không có chế độ khách.',
    },
    {
      icon: 'link' as const,
      title: 'Không có link tải công khai',
      body: 'Đường dẫn tệp do hệ thống sinh và không thể đoán để chia sẻ ra ngoài.',
    },
    {
      icon: 'eye-off' as const,
      title: 'Không lưu bản sao dùng chung',
      body: 'Tệp được trả về riêng cho từng phiên, không nằm trong cache công cộng.',
    },
  ];

  protected readonly faqs = [
    {
      question: 'Tôi cần tài khoản thế nào?',
      answer:
        'Đăng ký bằng email, mở link xác thực trong hộp thư rồi đăng nhập.',
    },
    {
      question: 'Có thể đọc trực tiếp trên web không?',
      answer:
        'PDF và DOCX mở trong trình đọc của Learning Hub. PPTX tải về để mở bằng PowerPoint khi cần thuyết trình.',
    },
    {
      question: 'Tài liệu được xếp theo gì?',
      answer:
        'Mỗi tài liệu thuộc đúng một môn học. Bạn có thể lọc thêm theo người đăng, loại tệp và từ khoá trong tên tài liệu.',
    },
    {
      question: 'Tệp của tôi có công khai không?',
      answer:
        'Không. Tệp tài liệu cần phiên đăng nhập mới mở được; không có link tải công khai để chia sẻ ra ngoài.',
    },
  ];
}
