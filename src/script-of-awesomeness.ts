// --- Type Definitions for Browser/External APIs ---

// Extend the global Window interface to let TypeScript know about Google Analytics functions.
// `declare global` is required because this file is an ES module — a bare
// `interface Window` would be module-local rather than augmenting the global.
declare global {
    interface Window {
        dataLayer: any[];
        gtag: (...args: any[]) => void;
    }
}

interface Book {
    title: string;
    author: string;
    narrator: string;
    duration: string;
    rating: number;
    purchaseDate: string;
    coverUrl: string;
    audibleUrl?: string;
}

// --- Global State Variables ---

let originalSlides: number;
let currentIndex: number = 1; // Start at index 1 to show the first original image (index 0 is the leading buffer slide)
let backgroundInterval: ReturnType<typeof setInterval> | undefined;
let animateCarousel: () => void;
let updateSlideFilters: (index: number) => void;
let applySlideFiltersAfterMove: (index: number, animated: boolean) => void;
// Assigned by setup(); called from animateCarousel(), the loop-reset
// handler, the manual nav buttons, and once at the end of setup() to
// prime initial state.
let updateFarClass: (activeIndex: number) => void;

// Shared mutable state passed by reference to lazy view modules
// (art.ts / tea.ts). Each module reads/sets `originalMainHTML` so the
// homepage HTML can be restored when the user navigates back.
const viewState: { originalMainHTML: string | null } = { originalMainHTML: null };

// Cached after first fetch so re-renders after art→home restore are instant.
let cachedBooks: Book[] | null = null;


// --- Lazy CSS Loader ---

// Tracks which on-demand stylesheets have been injected so we don't
// duplicate <link> tags on repeated navigations.
const loadedCss = new Set<string>();

function ensureCss(href: string): Promise<void> {
    if (loadedCss.has(href)) return Promise.resolve();
    loadedCss.add(href);
    return new Promise((resolve, reject) => {
        const l = document.createElement('link');
        l.rel = 'stylesheet';
        l.href = href;
        l.onload = () => resolve();
        l.onerror = (err) => {
            loadedCss.delete(href);
            reject(err);
        };
        document.head.appendChild(l);
    });
}

// --- Lazy View Loaders ---

async function loadArtView(): Promise<void> {
    const [, mod] = await Promise.all([
        ensureCss('art/art.css'),
        import('./art/art.js'),
    ]);
    await mod.getAndLoadArt(viewState);
    syncViewTitle('✏️ ');
}

async function loadTeaView(): Promise<void> {
    const [, mod] = await Promise.all([
        ensureCss('tea/tea.css'),
        import('./tea/tea.js'),
    ]);
    await mod.getAndLoadTea(viewState);
    syncViewTitle('🍵 ');
}

// --- Utility Functions ---

/**
 * Sets the background image for the document.
 * @param {number} index The index of the background image.
 * @param {HTMLElement} carouselContainer The container element for the carousel.
 * @param {boolean} enableTransition Whether to animate the slide (true) or jump instantly (false).
 */
function setBackgroundImg(index: number, carouselContainer: Readonly<HTMLElement>, enableTransition: boolean = true): void {
    if (enableTransition) {
        // Keep every visible slide saturated while the track moves; otherwise
        // the incoming (not yet .active) slide reads as an instant desaturate
        // in the viewport center as soon as the transform starts.
        carouselContainer.classList.add('carousel-sliding');
    } else {
        carouselContainer.classList.remove('carousel-sliding');
    }
    carouselContainer.dataset.carouselIndex = String(index);
    carouselContainer.classList.toggle('carousel-animated', enableTransition);
}

// --- Setup and Event Initialization ---

/**
 * Sets up the carousel animation and its event listeners.
 */
function setup(): void {
    const carouselContainer = document.querySelector<HTMLElement>(".carousel-container")!;
    const slides = document.querySelectorAll<HTMLElement>(".carousel-slide")!;
    const totalSlides = slides.length;
    originalSlides = totalSlides - 2;

    // Cache the video element and its slide index once so updateSlideFilters
    // never has to query the DOM on every transition.
    let videoEl: HTMLVideoElement | null = null;
    let videoSlideIndex = -1;
    slides.forEach((s, i) => {
        const v = s.querySelector<HTMLVideoElement>('video');
        if (v) {
            videoEl = v;
            videoSlideIndex = i;
        }
    });

    // Slides further than this many positions from the current center are
    // marked `.far`, which CSS uses to apply content-visibility: hidden.
    // 2 keeps the active slide plus one neighbor on each side rendered
    // (covering the partial-edge slides visible during a 90vw transition)
    // and an extra buffer slot on each side so the about-to-be-visible
    // slide is already laid out and decoded before it scrolls in.
    const FAR_DISTANCE = 3;
    updateFarClass = (activeIndex: number): void => {
        slides.forEach((s, i) => {
            const isFar = Math.abs(i - activeIndex) >= FAR_DISTANCE;
            const wasFar = s.classList.contains('far');
            if (wasFar === isFar) {
                return;
            }
            s.classList.toggle('far', isFar);
            // When a slide leaves the far zone, flip its <img> to eager
            // loading and kick off async decode so the bitmap is in the
            // browser's cache well before it animates into view. Decode
            // errors (e.g., the image hasn't started downloading yet)
            // are non-fatal -- the browser will decode on demand when
            // the slide is eventually rendered.
            if (wasFar) {
                const img = s.querySelector<HTMLImageElement>('img');
                if (img) {
                    img.loading = 'eager';
                    img.decode?.().catch(() => {});
                }
            }
        });
    };

    let activeSlideIndex = currentIndex;

    // One-time warm-up of the muted background video's decoder pipeline.
    // The video slide normally goes 14+ seconds before being reached the
    // first time; without this the very first transition onto it pays
    // the full cold-start cost (download last bytes, decode frame 0,
    // upload to GPU) on the animation hot path. Muted autoplay is
    // permitted without a user gesture, so play() should succeed; if it
    // doesn't, we silently fall back to the original lazy behavior.
    if (videoEl !== null) {
        const v: HTMLVideoElement = videoEl;
        v.play()
            .then(() => v.pause())
            .catch(() => {});
    }

    /**
     * Moves `.active` to the center slide (full saturation via CSS).
     * Only touches the outgoing and incoming slides — no inline styles.
     * @param {number} index The index of the slide that should be fully saturated.
     */
    updateSlideFilters = (index: number): void => {
        if (index !== activeSlideIndex) {
            slides[activeSlideIndex]?.classList.remove('active');
            slides[index].classList.add('active');
            activeSlideIndex = index;
        }
        if (videoEl !== null) {
            if (index === videoSlideIndex) {
                videoEl.play().catch(() => {});
            } else {
                videoEl.pause();
            }
        }
    };

    applySlideFiltersAfterMove = (index: number, animated: boolean): void => {
        if (!animated) {
            updateSlideFilters(index);
        }
    };

    animateCarousel = () => {
        currentIndex++;
        // Update far-class BEFORE the transform starts so the newly-near
        // slide gets its content-visibility flip and image decode kicked
        // off as early as possible -- not on the same frame as the
        // slide-in animation.
        updateFarClass(currentIndex);
        setBackgroundImg(currentIndex, carouselContainer);
        applySlideFiltersAfterMove(currentIndex, true);
    };

    carouselContainer.addEventListener('transitionend', (e: TransitionEvent) => {
        if (e.propertyName !== 'transform' || e.target !== carouselContainer) {
            return;
        }

        carouselContainer.classList.remove('carousel-sliding');

        // If we've reached the duplicated last slide, instantly reset to the first original slide
        if (currentIndex >= originalSlides + 1) {
            currentIndex = 1;
            setBackgroundImg(currentIndex, carouselContainer, false);
            updateFarClass(currentIndex);
            updateSlideFilters(currentIndex);
            return;
        }

        updateSlideFilters(currentIndex);
    });

    // Recalculate carousel position on window resize to maintain correct alignment
    let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
    window.addEventListener('resize', () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
            setBackgroundImg(currentIndex, carouselContainer, false);
        }, 150);
    });

    // Prime far-class state for the initial slide. The HTML ships with
    // no .far classes (so all slides paint on first load and the LCP
    // image isn't blocked by content-visibility: hidden); this call
    // hides everything outside the ±2 window once JS takes over.
    updateFarClass(currentIndex);

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (!mediaQuery.matches) {
        backgroundInterval = setInterval(animateCarousel, 7000);
        const onVisibilityChanged = () => {
            if (document.hidden) {
                clearTimeout(backgroundInterval)
            } else {
                backgroundInterval = setInterval(animateCarousel, 7000);
            }
        };
        document.addEventListener("visibilitychange", onVisibilityChanged, false);
    }
}

/**
 * Keeps the canonical link in sync with the current URL so search engines
 * index the correct URL for each view (?art, ?photos, or the base page).
 */
function syncCanonical(): void {
    const canonical = document.querySelector<HTMLLinkElement>('link[rel="canonical"]');
    if (canonical) {
        canonical.href = window.location.origin + window.location.pathname + window.location.search;
    }
}

function syncViewTitle(prefix = ''): void {
    document.title = prefix + document.title.replace(/^(✏️ |🍵 )/, '');
}

/**
 * Restores the homepage content, undoing an art/tea load.
 * Also re-renders the book grid so its event listeners (stripped by the
 * innerHTML assignment) are re-attached with fresh references.
 */
function restoreHome(): void {
    if (viewState.originalMainHTML === null) return;
    syncViewTitle();
    const content = document.querySelector<HTMLElement>(".content")!;
    const mainContent = content.querySelector<HTMLElement>("main")!;
    content.classList.remove("art");
    content.classList.remove("tea");
    mainContent.innerHTML = viewState.originalMainHTML;
    viewState.originalMainHTML = null;
    syncCanonical();
    if (cachedBooks) {
        const grid = mainContent.querySelector<HTMLElement>('.bookGrid');
        if (grid) renderBooks(cachedBooks, grid);
    }
}


/**
 * Escapes a string for safe insertion into HTML attribute values and text nodes.
 */
function escHtml(str: string): string {
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
}

/**
 * Returns up to two initials from a book title, used as placeholder art.
 */
function bookInitials(title: string): string {
    return title.split(/\s+/).slice(0, 2).map(w => w[0] ?? '').join('').toUpperCase();
}

/** Defer work until CSS entrance animations finish (last: .content @ 2.8s + 0.5s). */
function afterEntranceAnimations(fn: () => void): void {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        fn();
        return;
    }
    const { classList } = document.body;
    if (classList.contains('hide') || classList.contains('show')) {
        fn();
        return;
    }
    const content = document.querySelector<HTMLElement>('.content');
    if (!content || getComputedStyle(content).animationName === 'none') {
        fn();
        return;
    }
    let called = false;
    const run = () => {
        if (called) return;
        called = true;
        fn();
    };
    content.addEventListener('animationend', run, { once: true });
    setTimeout(run, 3400);
}

const BOOKS_BATCH_SIZE = 10;
let renderBooksGeneration = 0;

function scheduleRenderWork(fn: () => void): void {
    if ('requestIdleCallback' in window) {
        requestIdleCallback(fn, { timeout: 50 });
    } else {
        setTimeout(fn, 0);
    }
}

/** Column count for the book grid (card min-width 140px + gap 0.75rem ≈ 12px). */
function bookGridColumnCount(grid: HTMLElement): number {
    const cardMinWidth = 140 + 12;
    return Math.max(1, Math.floor((grid.offsetWidth + 12) / cardMinWidth));
}

/** HTML for a single book card. Pass revealIndex to stagger entrance on expand. */
function bookCardHtml(book: Book, revealIndex?: number): string {
    const stars = book.rating > 0
        ? `<span class="bookCard-rating" aria-label="${book.rating} out of 5 stars">${'★'.repeat(book.rating)}${'☆'.repeat(5 - book.rating)}</span>`
        : '';
    const cover = book.coverUrl
        ? `<img src="${escHtml(book.coverUrl)}" alt="Cover of ${escHtml(book.title)}" width="140" height="140" loading="lazy" crossorigin="anonymous" />`
        : `<div class="bookCard-placeholder" aria-hidden="true">${escHtml(bookInitials(book.title))}</div>`;
    const durationHtml = book.duration
        ? `<p class="bookCard-duration">${escHtml(book.duration)}</p>`
        : '';
    const cardInner = `${cover}
                <div class="bookCard-info">
                    <p class="bookCard-title">${escHtml(book.title)}</p>
                    <p class="bookCard-author">${escHtml(book.author)}</p>
                    ${stars}
                    ${durationHtml}
                </div>`;
    const revealClass = revealIndex !== undefined ? ' bookCard--reveal' : '';
    const revealAttr = revealIndex !== undefined ? ` data-book-index="${revealIndex}"` : '';
    return book.audibleUrl
        ? `<a class="bookCard${revealClass}" role="listitem"${revealAttr} href="${escHtml(book.audibleUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escHtml(book.title)} on Audible">${cardInner}</a>`
        : `<article class="bookCard${revealClass}" role="listitem"${revealAttr}>${cardInner}</article>`;
}

/** Appends books beyond the first visible row in idle-time batches. */
function appendRemainingBooks(
    books: Book[],
    cols: number,
    grid: HTMLElement,
    gen: number,
): void {
    let index = cols;

    const appendBatch = () => {
        if (gen !== renderBooksGeneration) return;

        const end = Math.min(index + BOOKS_BATCH_SIZE, books.length);
        grid.insertAdjacentHTML(
            'beforeend',
            books.slice(index, end).map((book, i) => bookCardHtml(book, index - cols + i)).join(''),
        );
        index = end;

        if (index < books.length) {
            scheduleRenderWork(appendBatch);
        }
    };

    scheduleRenderWork(appendBatch);
}

/** Removes cards beyond the first visible row when collapsing. */
function collapseBookGrid(grid: HTMLElement, cols: number): void {
    const cards = grid.querySelectorAll('.bookCard');
    for (let i = cols; i < cards.length; i++) {
        cards[i].remove();
    }
}

/** Wires up the "Show all" button after the initial visible row is rendered. */
function finishBookGrid(books: Book[], grid: HTMLElement, cols: number): void {
    grid.setAttribute('aria-busy', 'false');

    if (books.length <= cols) return;

    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'bookShowMore';
    btn.textContent = `Show all ${books.length} books`;
    const gen = renderBooksGeneration;

    btn.addEventListener('click', () => {
        const expanded = grid.classList.toggle('bookGrid--expanded');
        if (expanded) {
            btn.textContent = 'Show fewer books';
            appendRemainingBooks(books, cols, grid, gen);
        } else {
            btn.textContent = `Show all ${books.length} books`;
            collapseBookGrid(grid, cols);
            document.getElementById('books')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    });

    grid.insertAdjacentElement('afterend', btn);
}

/**
 * Renders book cards into the .bookGrid element in batches so the main thread
 * can paint between chunks. Calling again (e.g. after art→home restore) is safe:
 * it cancels any in-flight render and removes stale show-more buttons.
 */
function renderBooks(books: Book[], grid: HTMLElement): void {
    if (!books.length) return;

    const gen = ++renderBooksGeneration;

    document.querySelector('.bookShowMore')?.remove();
    grid.classList.remove('bookGrid--expanded');
    grid.setAttribute('aria-busy', 'true');
    grid.innerHTML = '';

    const cols = bookGridColumnCount(grid);
    const initialCount = Math.min(books.length, cols);
    let index = 0;

    const appendBatch = () => {
        if (gen !== renderBooksGeneration) return;

        const end = Math.min(index + BOOKS_BATCH_SIZE, initialCount);
        grid.insertAdjacentHTML('beforeend', books.slice(index, end).map(bookCardHtml).join(''));
        index = end;

        if (index < initialCount) {
            scheduleRenderWork(appendBatch);
        } else {
            finishBookGrid(books, grid, cols);
        }
    };

    scheduleRenderWork(appendBatch);
}

/**
 * Fetches books/library.json (once) then renders the book grid.
 * Subsequent calls reuse the cached data — safe to call after restoreHome().
 */
async function fetchBooks(): Promise<void> {
    try {
        if (!cachedBooks) {
            const response = await fetch('books/library.json');
            if (!response.ok) return;
            cachedBooks = await response.json() as Book[];
        }
        const grid = document.querySelector<HTMLElement>('.bookGrid');
        if (!grid) return;
        afterEntranceAnimations(() => renderBooks(cachedBooks!, grid));
    } catch {
        // Silently fail — the section simply stays empty
    }
}

// --- Document Ready / Main Execution ---

/**
 * Main function to run when the DOM is ready.
 */
function ready(): void {
    setup();
    fetchBooks();

    const toggle = document.getElementById('dark-mode-toggle')! as HTMLInputElement;
    toggle.addEventListener('change', () => {
        document.querySelector<HTMLMetaElement>('meta[name="color-scheme"]')!.content
            = toggle.checked ? 'dark' : 'light';
    });

    const navOpenerButton = document.querySelector<HTMLButtonElement>(".navOpener > button")!;
    navOpenerButton.addEventListener("click", (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        button.classList.toggle("open");
        const isExpanded = button.getAttribute("aria-expanded") === "true";
        button.setAttribute("aria-expanded", isExpanded ? "false" : "true");
        document.querySelector(".navHolder")!.classList.toggle("open");
    });

    const meLink = document.querySelector<HTMLAnchorElement>("#me")!;
    meLink.addEventListener("click", (event) => {
        const link = event.currentTarget as HTMLAnchorElement;
        const div = document.createElement("div");
        div.className = "me";
        div.innerHTML = '<iframe width="200" height="200" title="YouTube Video" src="https://www.youtube-nocookie.com/embed/EErY75MXYXI?rel=0&amp;controls=0&amp;showinfo=0&amp;autoplay=1&amp;modestbranding=1" frameborder="0" allow="autoplay;encrypted-media"></iframe>';
        link.parentNode?.replaceChild(div, link);

        div.querySelector("iframe")?.focus();
    });

    document.querySelector<HTMLAnchorElement>("a.art")!.addEventListener("click", (event) => {
        event.preventDefault();
        if (window.location.pathname === "/art") {
            navOpenerButton.click();
            return;
        }
        history.pushState({ view: "art" }, "", "/art");
        syncCanonical();
        loadArtView();
        navOpenerButton.click();
    });

    document.querySelectorAll<HTMLAnchorElement>("a.tea").forEach((teaLink) => {
        teaLink.addEventListener("click", (event) => {
            event.preventDefault();
            if (window.location.pathname === "/tea") {
                navOpenerButton.click();
                return;
            }
            history.pushState({ view: "tea" }, "", "/tea");
            syncCanonical();
            loadTeaView();
            navOpenerButton.click();
        });
    });

    document.querySelector<HTMLAnchorElement>("a.books")!.addEventListener("click", (event) => {
        event.preventDefault();
        if (document.querySelector(".navHolder")!.classList.contains("open")) {
            navOpenerButton.click();
        }
        if (window.location.pathname === "/art" || window.location.pathname === "/tea") {
            history.pushState(null, "", "/");
            restoreHome();
            syncCanonical();
            document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
        } else {
            if (cachedBooks) {
                const grid = document.querySelector<HTMLElement>('.bookGrid');
                if (grid) renderBooks(cachedBooks, grid);
            }
            document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
        }
    });

    const PHOTO_CLASSES = [
        "photos-expanding", "photos-expanded", "photos-controls",
        "photos-closing", "photos-collapsing",
    ] as const;
    const PHOTOS_CHROME_MS = 1000;
    const PHOTOS_EXPAND_MS = 750;

    let photosWasPushed = false;
    let photoStageTimers: ReturnType<typeof setTimeout>[] = [];

    const carouselContainer = document.querySelector<HTMLElement>(".carousel-container")!;
    const photoLeft = document.querySelector<HTMLButtonElement>(".photoB>.l")!;
    const photoRight = document.querySelector<HTMLButtonElement>(".photoB>.r")!;

    const clearPhotoStages = (): void => {
        photoStageTimers.forEach(clearTimeout);
        photoStageTimers = [];
    };

    const schedulePhotoStage = (run: () => void, delayMs: number): void => {
        photoStageTimers.push(setTimeout(run, delayMs));
    };

    const photoMotionEnabled = (): boolean =>
        !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    const isPhotoNavReady = (): boolean =>
        document.body.classList.contains("hide")
        && document.body.classList.contains("photos-expanded");

    const preparePhotoCarousel = (): void => {
        carouselContainer.classList.remove("carousel-animated", "carousel-sliding");
    };

    const syncPhotoNavButtons = (): void => {
        photoLeft.disabled = currentIndex === 1;
        photoRight.disabled = currentIndex === originalSlides;
    };

    const navigatePhoto = (delta: -1 | 1): void => {
        currentIndex += delta;
        setBackgroundImg(currentIndex, carouselContainer);
        updateFarClass(currentIndex);
        applySlideFiltersAfterMove(currentIndex, true);
        syncPhotoNavButtons();
    };

    const enterPhotoMode = (instant = false): void => {
        clearPhotoStages();
        preparePhotoCarousel();
        if (backgroundInterval) {
            clearInterval(backgroundInterval);
        }
        if (document.querySelector(".navHolder")!.classList.contains("open")) {
            navOpenerButton.click();
        }
        document.body.scrollTop = document.documentElement.scrollTop = 0;
        document.body.classList.remove("show", ...PHOTO_CLASSES);
        document.body.classList.add("hide");
        document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.tabIndex = -1);
        document.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.removeAttribute("tabIndex"));
        syncPhotoNavButtons();
        syncCanonical();

        if (instant || !photoMotionEnabled()) {
            document.body.classList.add("photos-expanded", "photos-controls");
            return;
        }

        schedulePhotoStage(() => document.body.classList.add("photos-expanding"), PHOTOS_CHROME_MS);
        schedulePhotoStage(() => {
            document.body.classList.remove("photos-expanding");
            document.body.classList.add("photos-expanded", "photos-controls");
        }, PHOTOS_CHROME_MS + PHOTOS_EXPAND_MS);
    };

    const finishClosePhotoMode = (): void => {
        backgroundInterval = setInterval(animateCarousel, 7000);
        document.body.classList.remove("hide", ...PHOTO_CLASSES);
        document.body.classList.add("show");
        document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.removeAttribute("tabIndex"));
        document.querySelectorAll<HTMLButtonElement>(".photoB > button").forEach(b => b.tabIndex = -1);
        document.querySelector<HTMLElement>("a.photos")?.focus();
        syncCanonical();
    };

    const closePhotoMode = (): void => {
        clearPhotoStages();
        photosWasPushed = false;
        if (!document.body.classList.contains("hide")) {
            return;
        }

        preparePhotoCarousel();
        if (!photoMotionEnabled()) {
            finishClosePhotoMode();
            return;
        }

        let delay = 0;
        if (document.body.classList.contains("photos-controls")) {
            schedulePhotoStage(() => {
                document.body.classList.add("photos-closing");
                document.body.classList.remove("photos-controls");
            }, PHOTOS_EXPAND_MS);
            delay = PHOTOS_EXPAND_MS;
        } else {
            document.body.classList.remove("photos-expanding");
        }

        if (document.body.classList.contains("photos-expanded")) {
            schedulePhotoStage(() => {
                void carouselContainer.offsetWidth;
                document.body.classList.add("photos-collapsing");
            }, delay);
            schedulePhotoStage(finishClosePhotoMode, delay + PHOTOS_EXPAND_MS);
        } else {
            schedulePhotoStage(finishClosePhotoMode, delay);
        }
    };

    // Closes photo mode: goes back in history if we pushed an entry,
    // otherwise replaces the URL and closes directly (handles direct-load case).
    const triggerClose = () => {
        if (photosWasPushed) {
            history.back(); // popstate fires → closePhotoMode()
        } else {
            history.replaceState(null, "", "/");
            closePhotoMode();
        }
    };

    window.addEventListener("popstate", (event) => {
        if (document.body.classList.contains("hide")) {
            closePhotoMode();
        }
        if (event.state?.view === "art") {
            syncCanonical();
            loadArtView();
        } else if (event.state?.view === "tea") {
            syncCanonical();
            loadTeaView();
        } else if (event.state?.view === "photos") {
            photosWasPushed = true;
            enterPhotoMode();
        } else {
            restoreHome();
        }
    });

    document.querySelector<HTMLAnchorElement>("a.photos")!.addEventListener("click", (event) => {
        event.preventDefault();
        photosWasPushed = true;
        history.pushState({ view: "photos" }, "", "/photos");
        enterPhotoMode();
    });

    const photoControls = document.querySelector(".photoB");
    if (photoControls) {
        photoControls.querySelector(".x")!.addEventListener("click", (event) => {
            event.preventDefault();
            triggerClose();
        });

        photoLeft.addEventListener("click", (event) => {
            event.preventDefault();
            navigatePhoto(-1);
        });

        photoRight.addEventListener("click", (event) => {
            event.preventDefault();
            navigatePhoto(1);
        });

        // --- Swipe Support for Mobile ---
        let touchStartX = 0;
        let touchEndX = 0;

        const handleGesture = () => {
            if (!isPhotoNavReady()) {
                return;
            }

            const swipeThreshold = 50;
            const diff = touchStartX - touchEndX;

            if (Math.abs(diff) > swipeThreshold) {
                if (diff > 0 && !photoRight.disabled) {
                    photoRight.click();
                } else if (diff < 0 && !photoLeft.disabled) {
                    photoLeft.click();
                }
            }
        };

        carouselContainer.addEventListener('touchstart', (e: TouchEvent) => {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });

        carouselContainer.addEventListener('touchend', (e: TouchEvent) => {
            touchEndX = e.changedTouches[0].screenX;
            handleGesture();
        }, { passive: true });
    }

    document.addEventListener("keydown", (event: KeyboardEvent) => {
        if (!document.body.classList.contains("hide")) {
            return;
        }
        if (event.key === "Escape") {
            triggerClose();
        } else if (!isPhotoNavReady()) {
            return;
        } else if (event.key === "ArrowLeft" && !photoLeft.disabled) {
            photoLeft.click();
        } else if (event.key === "ArrowRight" && !photoRight.disabled) {
            photoRight.click();
        }
    });

    if (window.location.pathname === "/art") {
        history.replaceState({ view: "art" }, "", "/art");
        syncCanonical();
        loadArtView();
    } else if (window.location.pathname === "/tea") {
        history.replaceState({ view: "tea" }, "", "/tea");
        syncCanonical();
        loadTeaView();
    } else if (window.location.pathname === "/photos") {
        history.replaceState({ view: "photos" }, "", "/photos");
        enterPhotoMode(true);
    }
}

// --- Initialization Logic ---

// Module scripts are deferred, so by the time this runs the DOM is parsed.
// Guard with readyState anyway to cover edge cases.
switch (document.readyState) {
    case "interactive":
    case "complete":
        ready();
        break;
    default:
        window.addEventListener("DOMContentLoaded", ready);
}

// --- Google Analytics ---

const GA_ID = 'G-SCCSHETMD9';

function initGoogleAnalytics(): void {
    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) { window.dataLayer.push(args); }
    window.gtag = gtag;
    gtag('js', new Date());
    gtag('config', GA_ID);

    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_ID}`;
    document.head.appendChild(script);
}

afterEntranceAnimations(initGoogleAnalytics);

// Required to make this file a module so dynamic import() works against
// the other module chunks (art.js / tea.js).
export {};
