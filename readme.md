Overview
========
The Coastal County Snapshot product line was developed over several years as a way to better inform coastal county managers about coastal issues. The goal was to take data that could be considered inaccessible to non-technical people and make it easy to understand.

Technology
==========
HTML and CSS for the layout. Javascript to push the data in. Flash for the map. The proxy.php file is not part of the original product, but something I have added to make it work on any domain, due to the data being served as XML, and thus subject to the same origin policy.

Background
==========
Originally began as a print-only product, a way to display the information became a priority shortly thereafter. After a couple of other, more complicated interfaces were developed, I had the (now obvious) realization that we could format the only version exactly the way the print version looks using HTML and CSS to mimic the layout, and Javascript to push the data from a RestAPI.

I piloted the idea in my spare time using the Flood snapshot and then presented to management. Once approved, it took a few weeks to complete the other snapshots to create a "beta" version. After testing, most issues related to issues in IE7, which were mostly resolved for launch in August 2011.

I also had in mind to make this responsive, so to look great on mobile. However, there was a requirement that we be able to produce a PDF version straight from the product. The software we selected met the requirement (WKHTMLtoPDF), but did not understand media queries. Thus they were abandoned. I tried a number of ways to get around this issue, but never had enough time to fully pursue any of them.

License
=======
No license information available. As this project was for the federal government, the implication is that there is [no copyright or license](http://en.wikipedia.org/wiki/Copyright_status_of_work_by_the_U.S._government).