# Connection scene

The signed-out MAX connection screen uses a #F5F8FC background, a stationary
400px form inside a bordered frosted-white panel and three user-provided transparent illustrations. The green
connector and blue paper plane/message bubble frame the four Russian jokes
specified by the user. Typography and control focus states follow the chat.

ConnectionScene.module.css owns this screen's layout and decorative tokens.
ConnectionForm.module.css owns the existing form controls. The scene does not
receive credentials; it uses only connection state to pause animation.

Desktop motion uses a single GSAP frame loop with separate parallax and bobbing layers,
different depths and opposing directions. The plane sits bottom-left and the
connector top-right. Switching away from a filled input to the other input moves
the plane 40px right and 22px up, once per field. A successful API response starts
a 700ms plane departure before mounting the chat; errors never start departure.
Reduced motion skips the departure and enters immediately. Form focus,
connection requests, reduced motion and coarse pointers suppress movement.
Below 1100px stickers disappear; below 768px only the static plane remains.
All decorations are inaccessible to assistive technology and ignore clicks.
The API, authenticated chat and session lifecycle retain their existing behavior.
