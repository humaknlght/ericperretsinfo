// --- Type Definitions for Browser/External APIs ---

// Extend the global Window interface to let TypeScript know about Google Analytics functions.
interface Window {
    dataLayer: any[];
    gtag: (...args: any[]) => void;
}

// Safari still requires a vendor prefix for the Fullscreen API.
interface DocumentWithFullscreen extends Document {
    webkitExitFullscreen?: () => Promise<void>;
}

interface HTMLElementWithFullscreen extends HTMLElement {
    webkitRequestFullscreen?: () => Promise<void>;
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

{
    // --- Global State Variables ---

    // It's good practice to define the types of our state variables.
    // 'ReturnType<typeof setInterval>' is a robust way to type interval IDs.
    let originalSlides: number;
    let currentIndex: number = 1; // Start at index 1 to show the first original image
    let backgroundInterval: ReturnType<typeof setInterval> | undefined;
    let animateCarousel: () => void;
    let updateSlideFilters: (index: number, instant?: boolean) => void;
    // Assigned by setup(); called from animateCarousel(), the loop-reset
    // handler, the manual nav buttons, and once at the end of setup() to
    // prime initial state.
    let updateFarClass: (activeIndex: number) => void;

    // Cached once; the browser keeps `.matches` live so no re-querying needed.
    const isMobileQuery = window.matchMedia('(max-width: 799px)');


    // --- Utility Functions ---

    /**
     * Sets the background image for the document.
     * @param {number} index The index of the background image.
     * @param {HTMLElement} carouselContainer The container element for the carousel.
     * @param {boolean} enableTransition Whether to animate the slide (true) or jump instantly (false).
     */
    function setBackgroundImg(index: number, carouselContainer: Readonly<HTMLElement>, enableTransition: boolean = true): void {
        // 1. Calculate the offset
        const offset = (-index * 90) + 5;

        // 2. Determine the duration (0.75s for small screens, 1.5s for large)
        const duration = isMobileQuery.matches ? '0.75s' : '1.5s';

        // 3. Apply via CSS custom properties; the class drives the transition
        carouselContainer.style.setProperty('--carousel-offset', `${offset}vw`);
        carouselContainer.style.setProperty('--carousel-duration', duration);
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

        // Tracks slides currently flagged with `will-change: filter` so we can:
        //   (a) avoid stacking duplicate transitionend listeners when a transition
        //       is interrupted by a rapid manual nav click, and
        //   (b) drop the compositor-layer hint as soon as each transition settles.
        // Listening on both `transitionend` and `transitioncancel` ensures the
        // hint is cleared even when the loop-reset path snaps `transition: 0s`
        // mid-flight (which fires `transitioncancel`, not `transitionend`).
        const promotedSlides = new Set<HTMLElement>();
        const promoteForFilterTransition = (slide: HTMLElement): void => {
            slide.style.willChange = 'filter';
            if (promotedSlides.has(slide)) {
                return;
            }
            promotedSlides.add(slide);
            const cleanup = (e: Event): void => {
                if ((e as TransitionEvent).propertyName !== 'filter') {
                    return;
                }
                slide.style.willChange = '';
                promotedSlides.delete(slide);
                slide.removeEventListener('transitionend', cleanup);
                slide.removeEventListener('transitioncancel', cleanup);
            };
            slide.addEventListener('transitionend', cleanup);
            slide.addEventListener('transitioncancel', cleanup);
        };

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
                s.classList.toggle('far', isFar);
                // When a slide leaves the far zone, flip its <img> to eager
                // loading and kick off async decode so the bitmap is in the
                // browser's cache well before it animates into view. Decode
                // errors (e.g., the image hasn't started downloading yet)
                // are non-fatal -- the browser will decode on demand when
                // the slide is eventually rendered.
                if (wasFar && !isFar) {
                    const img = s.querySelector<HTMLImageElement>('img');
                    if (img) {
                        img.loading = 'eager';
                        img.decode?.().catch(() => {});
                    }
                }
            });
        };

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
         * Toggles the `active` class on the center slide and removes it from all others,
         * so the CSS filter transitions play correctly.
         * @param {number} index The index of the slide that should be fully saturated.
         * @param {boolean} instant When true, bypasses the CSS transition (used for the seamless loop jump).
         */
        updateSlideFilters = (index: number, instant: boolean = false): void => {
            const duration = instant ? '0s' : (isMobileQuery.matches ? '0.75s' : '1.5s');
            slides.forEach((s, i) => {
                const isVideoSlide = videoSlideIndex !== -1 && i === videoSlideIndex;
                if (isVideoSlide && !instant) {
                    if (i === index) {
                        // Snap filter off immediately when becoming active
                        s.style.transition = 'filter 0s';
                        s.classList.add('active');
                        s.style.filter = '';
                    } else {
                        // Keep filter visually absent during the carousel position transition;
                        // the transitionend handler clears this inline override afterward.
                        s.style.transition = 'filter 0s';
                        s.classList.remove('active');
                        s.style.filter = 'none';
                    }
                } else {
                    const wasActive = s.classList.contains('active');
                    const willBeActive = i === index;
                    s.style.transition = `filter ${duration} ease-in-out`;
                    s.classList.toggle('active', willBeActive);
                    if (isVideoSlide) {
                        // instant reset: let CSS take over immediately
                        s.style.filter = '';
                    }
                    // Promote only the slides whose filter is actually about to
                    // animate (the outgoing and incoming). The hint is removed
                    // by `cleanup` in promoteForFilterTransition once the
                    // transition ends or is cancelled.
                    if (!instant && wasActive !== willBeActive) {
                        promoteForFilterTransition(s);
                    }
                }
            });
            if (videoEl !== null) {
                if (index === videoSlideIndex) {
                    videoEl.play().catch(() => {});
                } else {
                    videoEl.pause();
                }
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
            updateSlideFilters(currentIndex);
        };

        carouselContainer.addEventListener('transitionend', () => {
            // Once the carousel position transition ends, let CSS saturate the video slide
            // if it is no longer active (clears the inline filter:none override set during the slide-away).
            if (videoSlideIndex !== -1) {
                const videoSlide = slides[videoSlideIndex];
                if (!videoSlide.classList.contains('active')) {
                    videoSlide.style.filter = '';
                }
            }

            // If we've reached the duplicated last slide, instantly reset to the first original slide
            if (currentIndex >= originalSlides + 1) {
                currentIndex = 1;
                // false = Jump instantly back to start (no animation)
                setBackgroundImg(currentIndex, carouselContainer, false);
                updateFarClass(currentIndex);
                updateSlideFilters(currentIndex, true);
            }
        });

        // Recalculate carousel position on window resize to maintain correct alignment
        let resizeTimeout: ReturnType<typeof setTimeout> | undefined;
        window.addEventListener('resize', () => {
            // Debounce resize events to avoid excessive recalculations
            if (resizeTimeout) {
                clearTimeout(resizeTimeout);
            }
            resizeTimeout = setTimeout(() => {
                // Reapply the transform for the current index without transition
                setBackgroundImg(currentIndex, carouselContainer, false);
            }, 150);
        });

        // Prime far-class state for the initial slide. The HTML ships with
        // no .far classes (so all slides paint on first load and the LCP
        // image isn't blocked by content-visibility: hidden); this call
        // hides everything outside the ±2 window once JS takes over.
        updateFarClass(currentIndex);

        // Set an interval to trigger the next slide every 7 seconds
        // Only if the user hasn't requested reduced motion
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
     * Adds a click listener to an art item to toggle fullscreen view.
     * @param {HTMLAnchorElement} a The anchor element wrapping the art item.
     */
    function artItemClickListener(a: Readonly<HTMLAnchorElement>): void {
        a.addEventListener("click", (event: MouseEvent) => {
            event.preventDefault();

            // Use our custom interface for the document
            const docWithFullscreen = document as DocumentWithFullscreen;

            if (docWithFullscreen.fullscreenElement) {
                (docWithFullscreen.exitFullscreen ?? docWithFullscreen.webkitExitFullscreen)?.call(docWithFullscreen);
            } else {
                const targetEl = (event.currentTarget as HTMLElement).querySelector("img") as HTMLElementWithFullscreen;
                (targetEl.requestFullscreen ?? targetEl.webkitRequestFullscreen)?.call(targetEl);
            }
        });
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

    // Saved once so popstate can restore it.
    let originalMainHTML: string | null = null;

    // Cached after first fetch so re-renders after art→home restore are instant.
    let cachedBooks: Book[] | null = null;

    // Set to true before history.back() from the Books nav link so the
    // popstate handler knows to scroll to #books once home is restored.
    let scrollToBooksAfterRestore = false;

    // True when we pushed the ?art entry ourselves; false on direct load.
    // Mirrors the photosWasPushed pattern — on direct load there is no prior
    // home entry so history.back() would leave the site entirely.
    let artWasPushed = false;

    /**
     * Fetches and loads the art content into the page.
     */
    async function getAndLoadArt(): Promise<void> {
        try {
            const response = await fetch("art/");
            if (!response.ok) {
                throw new Error(`Response status: ${response.status}`);
            }
            const text = await response.text();
            const content = document.querySelector<HTMLElement>(".content")!;
            const mainContent = content.querySelector<HTMLElement>("main")!;

            if (originalMainHTML === null) {
                originalMainHTML = mainContent.innerHTML;
            }

            content.classList.add("art");
            mainContent.innerHTML = text;
            document.querySelectorAll<HTMLAnchorElement>(".artContent a").forEach(artItemClickListener);

            // Move focus to the start of the new content so screen readers are aware of the change
            const firstFocusableArt = mainContent.querySelector<HTMLElement>("a, button, input, [tabindex]:not([tabindex='-1'])");
            if (firstFocusableArt) {
                // Defer scroll until after the browser has laid out the new content
                requestAnimationFrame(() => {
                    firstFocusableArt.focus();
                    firstFocusableArt.scrollIntoView({ behavior: 'smooth' });
                });
            } else {
                // Fallback: focus the container if no interactive elements exist yet
                content.tabIndex = -1;
                content.focus();
            }

        } catch (error) {
            console.error("Failed to load art content:", error);
        }
    }

    /**
     * Restores the homepage content, undoing an art load.
     * Also re-renders the book grid so its event listeners (stripped by the
     * innerHTML assignment) are re-attached with fresh references.
     */
    function restoreHome(): void {
        if (originalMainHTML === null) return;
        const content = document.querySelector<HTMLElement>(".content")!;
        const mainContent = content.querySelector<HTMLElement>("main")!;
        content.classList.remove("art");
        mainContent.innerHTML = originalMainHTML;
        originalMainHTML = null;
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

    /**
     * Renders book cards into the .bookGrid element and wires up the "Show all" button.
     * Calling this again (e.g. after art→home restore) is safe: it removes any stale
     * button whose listeners were lost when innerHTML was replaced by restoreHome().
     */
    function renderBooks(books: Book[], grid: HTMLElement): void {
        if (!books.length) return;

        // Remove any orphaned show-more button left over from a previous render
        // whose event listeners were stripped by restoreHome()'s innerHTML assignment.
        document.querySelector('.bookShowMore')?.remove();

        grid.setAttribute('aria-busy', 'false');
        grid.innerHTML = books.map(book => {
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
            return book.audibleUrl
                ? `<a class="bookCard" role="listitem" href="${escHtml(book.audibleUrl)}" target="_blank" rel="noopener noreferrer" aria-label="${escHtml(book.title)} on Audible">${cardInner}</a>`
                : `<article class="bookCard" role="listitem">${cardInner}</article>`;
        }).join('');

        // Calculate columns from the grid's rendered width:
        // card min-width (140px) + gap (0.75rem ≈ 12px)
        const cardMinWidth = 140 + 12;
        const cols = Math.max(1, Math.floor((grid.offsetWidth + 12) / cardMinWidth));

        if (books.length > cols) {
            const cards = Array.from(grid.querySelectorAll<HTMLElement>('.bookCard'));
            cards.slice(cols).forEach((card, i) => {
                card.classList.add('bookCard--hidden');
                card.style.setProperty('--book-index', String(i));
            });

            const btn = document.createElement('button');
            btn.type = 'button';
            btn.className = 'bookShowMore';
            btn.textContent = `Show all ${books.length} books`;

            btn.addEventListener('click', () => {
                const expanded = grid.classList.toggle('bookGrid--expanded');
                btn.textContent = expanded ? 'Show fewer books' : `Show all ${books.length} books`;
                if (!expanded) {
                    document.getElementById('books')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });

            grid.insertAdjacentElement('afterend', btn);
        }
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
            renderBooks(cachedBooks, grid);
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

            // Move focus to the iframe so keyboard users can interact with the video immediately
            div.querySelector("iframe")?.focus();
        });

        document.querySelector<HTMLAnchorElement>("a.art")!.addEventListener("click", (event) => {
            event.preventDefault();
            if (window.location.search === "?art") {
                navOpenerButton.click();
                return;
            }
            artWasPushed = true;
            history.pushState({ view: "art" }, "", "?art");
            syncCanonical();
            getAndLoadArt();
            navOpenerButton.click();
        });

        document.querySelector<HTMLAnchorElement>("a.books")!.addEventListener("click", (event) => {
            event.preventDefault();
            if (document.querySelector(".navHolder")!.classList.contains("open")) {
                navOpenerButton.click();
            }
            if (window.location.search === "?art") {
                if (artWasPushed) {
                    // We pushed this entry — go back so the history stack stays
                    // intact and the browser back button continues to work.
                    // popstate → restoreHome() (re-renders books) → scroll flag.
                    scrollToBooksAfterRestore = true;
                    history.back();
                } else {
                    // Direct load of ?art — no prior home entry exists, so
                    // history.back() would leave the site. Restore in-place instead.
                    artWasPushed = false;
                    history.replaceState(null, "", location.pathname);
                    restoreHome();
                    syncCanonical();
                    document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
                }
            } else {
                // Already on home — just ensure books are rendered and scroll.
                if (cachedBooks) {
                    const grid = document.querySelector<HTMLElement>('.bookGrid');
                    if (grid) renderBooks(cachedBooks, grid);
                }
                document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
            }
        });

        // True when we pushed a photos history entry ourselves; false on direct load.
        let photosWasPushed = false;

        const enterPhotoMode = () => {
            if (backgroundInterval) {
                clearInterval(backgroundInterval);
            }
            if (document.querySelector(".navHolder")!.classList.contains("open")) {
                navOpenerButton.click();
            }
            document.body.scrollTop = document.documentElement.scrollTop = 0;
            document.body.classList.remove("show");
            document.body.classList.add("hide");
            document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.tabIndex = -1);
            document.querySelectorAll<HTMLButtonElement>("button").forEach(b => b.removeAttribute("tabIndex"));

            const rightButton = document.querySelector<HTMLButtonElement>(".photoB>.r")!;
            rightButton.disabled = (currentIndex === originalSlides);

            const leftButton = document.querySelector<HTMLButtonElement>(".photoB>.l")!;
            leftButton.disabled = (currentIndex === 1);
            syncCanonical();
        };

        const closePhotoMode = () => {
            photosWasPushed = false;
            backgroundInterval = setInterval(animateCarousel, 7000);
            document.body.classList.remove("hide");
            document.body.classList.add("show");
            document.querySelectorAll<HTMLAnchorElement>("a").forEach(a => a.removeAttribute("tabIndex"));
            document.querySelectorAll<HTMLButtonElement>(".photoB > button").forEach(b => b.tabIndex = -1);
            document.querySelector<HTMLElement>("a.photos")?.focus();
            syncCanonical();
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
                getAndLoadArt();
            } else if (event.state?.view === "photos") {
                photosWasPushed = true;
                enterPhotoMode();
            } else {
                artWasPushed = false;
                restoreHome();
                if (scrollToBooksAfterRestore) {
                    scrollToBooksAfterRestore = false;
                    requestAnimationFrame(() => {
                        document.getElementById('books')?.scrollIntoView({ behavior: 'smooth' });
                    });
                }
            }
        });

        document.querySelector<HTMLAnchorElement>("a.photos")!.addEventListener("click", (event) => {
            event.preventDefault();
            photosWasPushed = true;
            history.pushState({ view: "photos" }, "", "?photos");
            enterPhotoMode();
        });

        const photoControls = document.querySelector(".photoB");
        if (photoControls) {
            photoControls.querySelector(".x")!.addEventListener("click", (event) => {
                event.preventDefault();
                triggerClose();
            });

            const carouselContainer = document.querySelector<HTMLElement>(".carousel-container")!;
            photoControls.querySelector<HTMLButtonElement>(".l")?.addEventListener("click", (event) => {
                event.preventDefault();
                setBackgroundImg(--currentIndex, carouselContainer);
                updateFarClass(currentIndex);
                updateSlideFilters(currentIndex);
                const targetButton = event.currentTarget as HTMLButtonElement;
                if (currentIndex === 1) {
                    targetButton.disabled = true;
                }
                const rightButton = photoControls.querySelector<HTMLButtonElement>(".r")!;
                rightButton.disabled = false;
            });

            photoControls.querySelector<HTMLButtonElement>(".r")!.addEventListener("click", (event) => {
                event.preventDefault();
                setBackgroundImg(++currentIndex, carouselContainer);
                updateFarClass(currentIndex);
                updateSlideFilters(currentIndex);
                const targetButton = event.currentTarget as HTMLButtonElement;
                if (currentIndex === originalSlides) {
                    targetButton.disabled = true;
                }
                const leftButton = photoControls.querySelector<HTMLButtonElement>(".l")!;
                leftButton.disabled = false;
            });

            // --- Swipe Support for Mobile ---
            let touchStartX = 0;
            let touchEndX = 0;

            const handleGesture = () => {
                // Ensure we are in "photo mode" (where body has 'hide' class)
                if (!document.body.classList.contains("hide")) {
                    return;
                }

                const swipeThreshold = 50; // Minimum distance to be considered a swipe
                const diff = touchStartX - touchEndX;

                if (Math.abs(diff) > swipeThreshold) {
                    if (diff > 0) {
                        // Swiped Left -> Go to Next Photo
                        const nextButton = photoControls.querySelector<HTMLButtonElement>(".r")!;
                        if (!nextButton.disabled) {
                            nextButton.click();
                        }
                    } else {
                        // Swiped Right -> Go to Previous Photo
                        const prevButton = photoControls.querySelector<HTMLButtonElement>(".l")!;
                        if (!prevButton.disabled) {
                            prevButton.click();
                        }
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
            } else if (event.key === "ArrowLeft") {
                const leftButton = document.querySelector<HTMLButtonElement>(".photoB>.l")!;
                if (!leftButton.disabled) {
                    leftButton.click();
                }
            } else if (event.key === "ArrowRight") {
                const rightButton = document.querySelector<HTMLButtonElement>(".photoB>.r")!;
                if (!rightButton.disabled) {
                    rightButton.click();
                }
            }
        });

        if (window.location.search === "?art") {
            history.replaceState({ view: "art" }, "", "?art");
            syncCanonical();
            getAndLoadArt();
        } else if (window.location.search === "?photos") {
            history.replaceState({ view: "photos" }, "", "?photos");
            enterPhotoMode();
        }
    }

    // --- Initialization Logic ---

    // Check document readiness and call the main function.
    switch (document.readyState) {
        case "interactive":
        case "complete":
            ready();
            break;
        default:
            window.addEventListener("DOMContentLoaded", ready);
    }

    // --- Google Analytics ---

    window.dataLayer = window.dataLayer || [];
    function gtag(...args: any[]) { window.dataLayer.push(args); }
    gtag('js', new Date());
    gtag('config', 'G-SCCSHETMD9');
}