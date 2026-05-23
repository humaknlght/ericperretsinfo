// Lazy-loaded view module for ?tea. Imported on demand from
// script-of-awesomeness.ts so the homepage critical path doesn't pay for it.

export interface ViewState {
    originalMainHTML: string | null;
}

export async function getAndLoadTea(state: ViewState): Promise<void> {
    try {
        const response = await fetch("/tea/tea.html");
        if (!response.ok) {
            throw new Error(`Response status: ${response.status}`);
        }
        const text = await response.text();
        const content = document.querySelector<HTMLElement>(".content")!;
        const mainContent = content.querySelector<HTMLElement>("main")!;

        if (state.originalMainHTML === null) {
            state.originalMainHTML = mainContent.innerHTML;
        }

        content.classList.add("tea");
        mainContent.innerHTML = text;

        // Scroll to the section title — not the first product link —
        // so "Tea Corner" stays visible beneath the fixed nav.
        const teaHeading = mainContent.querySelector<HTMLElement>(".teaContent > h2");
        const firstFocusable = mainContent.querySelector<HTMLElement>("a, button, input, [tabindex]:not([tabindex='-1'])");

        requestAnimationFrame(() => {
            if (teaHeading) {
                teaHeading.tabIndex = -1;
                teaHeading.focus({ preventScroll: true });
                teaHeading.scrollIntoView({ behavior: 'smooth', block: 'start' });
            } else if (firstFocusable) {
                firstFocusable.focus();
                firstFocusable.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            } else {
                content.tabIndex = -1;
                content.focus();
            }
        });
    } catch (error) {
        console.error("Failed to load tea content:", error);
    }
}
