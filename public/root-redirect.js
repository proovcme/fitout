(() => {
  const chapter = new URL('./prototypes/fitout-chapter-one.html', window.location.href);
  chapter.search = window.location.search;
  chapter.hash = window.location.hash;
  window.location.replace(chapter.href);
})();
