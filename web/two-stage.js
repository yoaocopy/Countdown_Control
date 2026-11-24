(() => {
  const destination = new URL("./display.html", location.href);
  destination.search = location.search;
  if (location.protocol === "file:") destination.searchParams.set("stages", "2");
  destination.hash = location.hash;
  location.replace(destination);
})();
