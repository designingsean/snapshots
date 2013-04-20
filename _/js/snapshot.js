//setup for querying and displaying ArcServer stuff
dojo.require("esri.map");
dojo.require("esri.tasks.query");
dojo.require("esri.layers.FeatureLayer");
dojo.require("esri.tasks.geometry");

/*
Couldn't use built-in jQuery slideUp/slideDown functions, as they finish with display:none, which reset the Flex map in most browsers.
This jQuery plugin does basically the same thing, but instead we do visibility:hidden via the CSS class .hide
*/
(function($){
	$.fn.paneOpen = function() {
		return this.each(function() {
				$(this).removeClass('hide').animate({height:'400px'});
		});
	};
	$.fn.paneClose = function() {
		return this.each(function() {
				$(this).animate({height:0}, function() {
					$(this).addClass('hide');
					$('.toolbar a').removeClass('active');	
				});
		});
	};
})(jQuery);


/*
Common settings for all charts
*/
Highcharts.setOptions({
	chart: {
		borderColor: '#ffffff',
		borderRadius: 0
	},
	credits: {
		enabled: false 
	},
	plotOptions: {
		pie: {
			point: {
                events: {
                    legendItemClick: function(event) {
                        event.preventDefault();
                    }
                }
            },
            states: {
                hover: {
                    enabled: false
                }
            }
		}
	},
	title: {
		text: null
	},
	tooltip: {
		formatter: function() {
			var name = this.point.name;
			var value= Math.round(this.percentage) + '%';
			if(this.point.name === undefined) {
				name = this.series.name;
				value = Math.round(this.y*100)/100;
			}
			
			return '<strong>' + name + '</strong><br>' + value;
		}
	},
	legend: {
		layout: 'vertical',
		align: 'right',
		verticalAlign: 'middle'
	},
	exporting: {
		buttons: {
			printButton: {
				enabled: false
			},
			exportButton: {
				enabled: false
			}
		}
	}
});

//common snapshot functions
var snapshot = (function() {
	//set up the internal reference
	var my = {}; //my = public functions
	//private variables
	var mapLoaded = false, //is the javascript map for the snapshot already loaded?
	domain = document.domain, //fixes cross domain errors between www.csc.noaa.gov and csc.noaa.gov
	queryTaskList = null, //variables for building state/county drop downs
	queryList = null,
	countyList = '';
	isMapClick = false;
	flexMap = null;
	var cache = new Date();
	
	//public variables
	my.newFIPS = null;
	my.currentFIPS = null;
	my.newSnapshot = null;
	my.currentSnapshot = null;
	my.snapshotName = null; //the next three are used for the PDF filename
	my.countyName = null;
	my.stateName = null;
	//my.dataService = 'http://' + domain + '/dataservices';
	//my.dataService = 'http://www.csc.noaa.gov/dataservices';
	//my.mapService = 'http://' + domain + '/arcgis/rest/services';
	my.mapService = 'http://www.csc.noaa.gov/arcgis/rest/services';
	my.queryTask = null; //variables for building individual snapshot maps
	my.query = null;
	my.selectMapReady = false; //is the Flex state/county selector map ready
	
	//private functions
	
	/*
	returns the appropriate data service URL
	called by snapshot.getData
	*/
	function getDataURL() {
		//replacing this with local php proxy due to domain access restrictions on XML
		/* var dataURL;
		switch(my.currentSnapshot) {
			case 'ocean':
				dataURL = my.dataService + '/Snapshot/OceanJobs?StateCountyFIPS=' + my.currentFIPS;
				break;
			case 'flood':
				dataURL = my.dataService + '/Snapshot/FloodData?StateCountyFIPS=' + my.currentFIPS;
				break;
			case 'wetlands':
				dataURL = my.dataService + '/Snapshot/WetlandsBenefits?StateCountyFIPS=' + my.currentFIPS;
				break;
		}
		return dataURL; */
		return 'proxy.php?snapshot=' + my.currentSnapshot + '&fips=' + my.currentFIPS;
	};
	
	/*
	returns proper structure for calling functions inside flex map
	called by snapshot.sendSelectedSnapshot, snapshot.changeState, snapshot.changeCounty
	*/
	function thisMovie(movieName) {
		return swfobject.getObjectById(movieName);
	};
	
	/*
	disables snapshot selection buttons if a snapshot is not available for a selected county
	called by snapshot.loadContent
	*/
	function snapshotAvail() {
		$('#pane1 button').removeAttr('disabled');
		queryListTask = new esri.tasks.QueryTask(my.mapService + '/Snapshot/Snapshot_Query/MapServer/1');
		queryList = new esri.tasks.Query();
		queryList.returnGeometry = false;
        queryList.outFields = ['FLOOD', 'OCEAN_JOBS', 'WETLAND'];
		queryList.where = 'FIPS = ' + my.currentFIPS;
        queryListTask.execute(queryList, function(results) {
			var attr = results.features[0].attributes;
			if (attr.FLOOD === 0)
				$('#pane1 button[name="flood"]').attr('disabled', 'disabled');
			if (attr.OCEAN_JOBS === 0)
				$('#pane1 button[name="ocean"]').attr('disabled', 'disabled');
			if (attr.WETLAND === 0)
				$('#pane1 button[name="wetlands"]').attr('disabled', 'disabled');
		});
	};
	
	/*
	makes a call to the server so it can log the snapshot and the county
	called by snapshot.startLoad
	*/
	function logSnapshot() {
		//not needed in a non-CSC instance.
		/* var snapshot = my.newSnapshot || my.currentSnapshot;
		var FIPS = my.newFIPS || my.currentFIPS;
		$.get(snapshot + '/' + FIPS + '.html'); */
	}
	
	/*
	loads the flex selector map
	called by snapshot.init
	*/
	function loadMap() {
		var swfVersionStr = "10.0.0";
		var xiSwfUrlStr = "_/map/playerProductInstall.swf";
		var flashvars = {};
		var params = {};
		params.quality = "high";
		params.bgcolor = "#ffffff";
		params.allowscriptaccess = "sameDomain";
		params.allowfullscreen = "true";
		var attributes = {};
		attributes.id = "USFlexMap";
		attributes.name = "USFlexMap";
		attributes.align = "middle";
		swfobject.embedSWF("_/map/Snapshots_FlexMap.swf?v=" + cache.getTime(), "flashContent", "678", "376", swfVersionStr, xiSwfUrlStr, flashvars, params, attributes);
	};
	
	/*
	gets details on every county and puts it in to an xml file in memory. makes it faster to search with jQuery
	called by snapshot.init
	*/
	function getCounties() {
		queryListTask = new esri.tasks.QueryTask(my.mapService + '/Snapshot/Snapshot_Query/MapServer/1');
		queryList = new esri.tasks.Query();
		queryList.returnGeometry = false;
        queryList.outFields = ['NAME', 'STATE_NAME', 'STATE_FIPS', 'CNTY_FIPS', 'FLOOD', 'OCEAN_JOBS', 'WETLAND'];
		queryList.where = '1 = 1';
        queryListTask.execute(queryList, function(results) {
			var stateArray = [];
			var tempArray = []
			var xml = '<counties>';
			$.each(results.features, function(i, val) {
				xml += '<county name="' + val.attributes.NAME + '" stateName="' + val.attributes.STATE_NAME + '" stateFIPS="' + val.attributes.STATE_FIPS + '" countyFIPS="' + val.attributes.CNTY_FIPS + '" flood="' + val.attributes.FLOOD + '" ocean="' + val.attributes.OCEAN_JOBS + '" wetlands="' + val.attributes.WETLAND + '"></county>';
				if ($.inArray(val.attributes.STATE_FIPS, tempArray) === -1) {
					stateArray.push([val.attributes.STATE_FIPS, val.attributes.STATE_NAME]);
					tempArray.push(val.attributes.STATE_FIPS);
				}
			});
			xml += '</counties>';
			countyList = $.parseXML( xml );
			$.each(stateArray.sort(), function(i, val) {
				$('#stateList').append('<option value="' + val[0] + '">' + val[1] + '</option>');
			});
			//if user is coming in with snapshot/county already picked out, then fix the state drop down to match
			if((!my.newFIPS || !my.newSnapshot) && (my.currentFIPS || my.currentSnapshot)) {
				my.stateChange(my.currentFIPS.substr(0,2));
				if(my.selectMapReady)
					my.changeState(my.currentFIPS.substr(0,2));
			}
		});
	};
	
	/*
	shows a notice for certain ocean counties where data is whack.
	called by snapshot.startLoad
	*/
	function showNotice() {
		$('.notice').remove();
		if ( my.currentSnapshot === 'ocean') {
			if ( my.currentFIPS === '34003' || my.currentFIPS === '34015' || my.currentFIPS === '53067' ) {
				$('body').prepend('<div class="notice">The data for this county is currently under development.</div>');
				$('body').css('background-position', 'left 42px');
			}
		}
	};
	
	//public functions
	
	/*
	what it does
	called by document.load
	*/
	my.init = function() {
		loadMap();
		getCounties();
	};
	
	/*
	once the flex map is loaded, catch it up with any selections that have been made
	called by the flex map
	*/
	my.mapReady = function() {
		my.selectMapReady = true;
		//flexMap = thisMovie('USFlexMap');
		var theSnapshot = my.newSnapshot || my.currentSnapshot;
		var theFIPS = my.newFIPS || my.currentFIPS;
		if(theSnapshot !== null)
			my.sendSelectedSnapshot(theSnapshot);
		
		if(theFIPS !== null) {
			my.changeState(theFIPS.substr(0,2));
			setTimeout(my.changeCounty(theFIPS.substr(2)), 1000);
		} else if($('#selectState').val() !== '0') {
			my.changeState($('#selectState').val());
		}
	};
	
	/*
	sends which snapshot is selected to flex map
	called by #pane1 button click handler and snapshot.mapReady
	*/
	my.sendSelectedSnapshot = function(theSnapshot) {
		thisMovie('USFlexMap').selectedSnapshot(theSnapshot);
	};
	
	/*
	sends which state is selected in drop down to flex map
	called by #stateList change handler and snapshot.mapReady
	*/
	my.changeState = function(theState) {
		thisMovie('USFlexMap').selectedState(theState);
	};
	
	/*
	sends which county is selected in drop down to flex map
	called by #countyList change handler, snapshot.mapReady, snapshot.countyList
	*/
	my.changeCounty = function(theCounty) {
		thisMovie('USFlexMap').selectedCounty(theCounty);
	};
	
	/*
	gets the state portion of the FIPS on flex map click of state
	called by flex app
	NOTE: this function name cannot change without also changing the reference in the flex map
	*/
	my.returnStateFIPS = function(theState) {
		snapshot.stateChange(theState);
	};
	
	/*
	gets the full FIPS on flex map click of county
	called by flex app
	NOTE: this function name cannot change without also changing the reference in the flex map
	*/
	my.returnFIPS = function(FIPS) {
		if(FIPS.substr(0,2) !== $('#stateList').val())
			snapshot.stateChange(FIPS.substr(0,2));
		$('#countyList').val(FIPS.substr(2));
		$('.close').focus();
		snapshot.getFIPS(FIPS);
	};
	
	/*
	sets the current state in the drop down and fires county list update
	called by snapshot.returnStateFIPS and snapshot.returnFIPS
	*/
	my.stateChange = function(stateFIPS) {
		$('#stateList').val(stateFIPS);
		my.createCountyList(stateFIPS);
	};
	
	/*
	builds/updates the county drop down by polling the map service
	called by snapshot.stateChange and #stateList change handler
	*/
	my.createCountyList = function(stateFIPS) {
		$('#countyList').empty();
		$('#countyList').append('<option value="0">Select County</option>');
		var snapshot = my.newSnapshot || my.currentSnapshot;
		$('county[stateFIPS="'+stateFIPS+'"]['+snapshot+'="1"]', countyList).each(function() {
			$('#countyList').append('<option value="' + $(this).attr('countyFIPS') + '">' + $(this).attr('name') + '</option>');
		});
		if((!my.newFIPS || !my.newSnapshot) && (my.currentFIPS || my.currentSnapshot)) {
			$('#countyList').val(my.currentFIPS.substr(2));
			if(my.selectMapReady)
				my.changeCounty(my.currentFIPS.substr(2));
		}
	};
	
	/*
	fires when new county is selected
	called by #countyList change handler
	*/
	my.getFIPS = function(FIPS) {
		my.newFIPS = FIPS;
		
		//var snapshot = my.currentSnapshot || my.newSnapshot;
		if(my.currentSnapshot) {
			$.history.load(my.currentSnapshot + '&' + my.newFIPS);
			//$.address.change(my.loadContent(my.currentSnapshot + '&' + my.newFIPS));
			$('.close').click();
		} else if(my.newSnapshot) {
			$.history.load(my.newSnapshot + '&' + my.newFIPS);
			//$.address.change(my.loadContent(my.newSnapshot + '&' + my.newFIPS));
			$('.close').click();
		} else {
			$('.toolbar a[href="#pane1"]').click();
		}
	};
	
	/*
	fires when new snapshot is selected
	called by #pane1 button click handler
	*/
	my.getSnapshot = function(snapshot) {
		my.newSnapshot = snapshot;
		if(my.currentFIPS) {
			$.history.load(my.newSnapshot + '&' + my.currentFIPS);
			//$.address.change(my.loadContent(my.newSnapshot + '&' + my.currentFIPS));
			$('.close').click();
		} else if (my.newFIPS) {
			$.history.load(my.newSnapshot + '&' + my.newFIPS);
			//$.address.change(my.loadContent(my.newSnapshot + '&' + my.newFIPS));
			$('.close').click();
		} else {
			$('.toolbar a[href="#pane2"]').click();
		}
		if ($('#stateList').val() !== '0') {
			my.createCountyList($('#stateList').val());
		}
		if(my.selectMapReady) {
			my.sendSelectedSnapshot(my.newSnapshot);
		}
		//need to update county drop down if they select a state then flip back
	};
	
	/*
	loads the appropriate snapshot in to the root HTML
	called by the jQuery history plugin, which is loaded at document.load
	*/
	my.loadContent = function(hash) {
		if(hash !== '') {
		my.screenProcess('hide');
		hash = hash.split('&');
		$('.download').show();
		$('.reset').show();
		my.currentFIPS = hash[1];
		if(my.currentSnapshot != hash[0]) {
			$('#snapshot').load(hash[0] + '.html', function() {
				mapLoaded = false;
				my.currentSnapshot = hash[0];
				my.startLoad();
			});
		} else {
			my.startLoad();
		}
		snapshotAvail();
		}
	};
	
	/*
	decides if we need to set up the map for the snapshot, fire the query event for that map, and get the XML
	called by snapshot.loadContent
	*/
	my.startLoad = function() {
		if(!mapLoaded) {
			my[my.currentSnapshot].createMap();
			mapLoaded = true;
		}
		my.execute();
		my.getData();
		showNotice();
		logSnapshot();
	};
	
	/*
	jQuery to get the XML for the specific snapshot and county
	called by snapshot.startLoad
	*/	
	my.getData = function() {
		$.ajax({
			type: 'GET',
			url: getDataURL(),
			dataType: 'xml',
			success: my[my.currentSnapshot].xmlParser
		});
	};
	
	/*
	sets up the query for the individual snapshot map, and executes it
	called by snapshot.startLoad
	*/
	my.execute = function() {
		my.query.where = 'FIPS = ' + my.currentFIPS;
		my.queryTask.execute(my.query, my[my.currentSnapshot].showResults);
	};
	
	/*
	this function is used by a number of charts to create the zebra striping in the backgorund
	called by flood.buildCharts and ocean.buildCharts
	*/
	my.findRange = function(array) {
		var minArr = [];
		var maxArr = [];
		var minNum, maxNum, stepNum, numDig;
		var bigNum = '100000000';
		for(i=0; i<array.length; i++) {
			minNum = Math.min.apply( Math, array[i] );
			maxNum = Math.max.apply( Math, array[i] );
			minArr.push(minNum);
			maxArr.push(maxNum);
		}
		minNum = Math.min.apply( Math, minArr );
		maxNum = Math.max.apply( Math, maxArr );
		
		stepNum = (Math.abs(minNum) + Math.abs(maxNum))/6;
		if(stepNum <1)
			stepNum = 1;
		numDig = Math.round(stepNum) + '';
		numDig = parseInt(bigNum.substr(0,numDig.length));
		
		var finalNum = Math.round(stepNum/numDig)*numDig;
		return finalNum;
	};
	
	/*
	sends current URL to PDF generator
	called by .download click handler
	*/
	my.printPDF = function() {
		var url = encodeURIComponent(document.location.href);
		var title = encodeURIComponent(my.snapshotName + ' Snapshot - ' + my.countyName + ', ' + my.stateName);
		
		window.open('_/pdf/generatePDF.php?url=' + url + '&title=' + title);
		
		//Sean was trying to put a Generating PDF alert - couldn't get it working.
		/*$.post('_/pdf/generatePDF.php', { title: my.snapshotName + ' Snapshot - ' + my.countyName + ', ' + my.stateName, content: $('#main').html() },
			function(data) {
				console.log(data);
			}
		);*/
		/*$('#pdfTitle').val(my.snapshotName + ' Snapshot - ' + my.countyName + ', ' + my.stateName);
		$('#pdfContent').val($('#main').html());
		$('#pdfGenerator').submit();*/
	};
	
	/*
	sets the snapshot name, county name, and state name variables
	called by flood.xmlParser and ocean.xmlParser
	*/
	my.setNames = function(snapshotName, countyName, stateName) {
		my.snapshotName = snapshotName;
		my.countyName = countyName;
		my.stateName = stateName;
	};
	
	/*
	when clicking on a chart, this opens a larger version in a modal
	called by a click on every chart
	*/
	my.openModal = function(chartOptions)  {
		var chartRenderTo = chartOptions.chart.renderTo;
		var chartEvents = chartOptions.chart.events;
		var chartTitle = $('#' + chartRenderTo).parent().find('p:first').text();
		var chartLegend = '';
		$('#' + chartRenderTo).parents('.section').find('p.mapLegend').each(function() {
			chartLegend += $(this).html() + '<br>';
		});
		chartLegend = chartLegend.replace(/[\(\)NA0-9\%\.]/g, '');
		chartOptions.chart.events = { click: null };
		chartOptions.chart.renderTo = 'modal';
		chartOptions.exporting.enabled = true;
		chartOptions.legend.enabled = true;
		chartOptions.title.text = chartTitle;
		if (chartOptions.plotOptions.column)
			chartOptions.plotOptions.column.enableMouseTracking = true;
		if (chartOptions.plotOptions.line)
			chartOptions.plotOptions.line.enableMouseTracking = true;
		$.modal('<a class="modalSaveImg" onClick="modalChart.exportChart();" title="Save Chart as PNG"></a><div id="modal"></div>', {
			onClose: function() {
				chartOptions.chart.renderTo = chartRenderTo;
				chartOptions.exporting.enabled = false;
				chartOptions.chart.events = chartEvents;
				chartOptions.legend.enabled = false;
				chartOptions.title.text = null;
				if (chartOptions.plotOptions.column)
					chartOptions.plotOptions.column.enableMouseTracking = false;
				if (chartOptions.plotOptions.line)
					chartOptions.plotOptions.line.enableMouseTracking = false;
				$.modal.close();
			}
		});
		modalChart = new Highcharts.Chart(chartOptions);
	};
	
	/*
	displays the processing animation and fades out the screen
	called by snapshot.loadContent and each snapshot's buildCharts function
	*/
	my.screenProcess = function(status) {
		if (status === 'hide') {
			$('#snapshot').animate({opacity:0.25}, 'slow');
			$('body').append('<div id="process"></div>');
			$('#process').css("left", (($(window).width() - 48) / 2) + $(window).scrollLeft() + "px").css("top", (($(window).height() - 48) / 2) + $(window).scrollTop() + "px").fadeIn();
		} else {
			$('#snapshot').animate({opacity:1}, 'slow');
			$('#process').fadeOut(function() {
				$(this).remove();
			});
		}
	};

	
	//expose public variables and functions
	return my;
}());

//variables and functions specific to the flood snapshot
snapshot.flood = (function() {
	var my = {};
	//private variables
	var floodMap, floodLayer, imageParameters,
	demo1Data, demo2Data, demo3Data, infraData, env1Data, env2Data, displayVals, hasAcres,
	demo1Options, demo2Options, demo3Options, env1Options, env2Options,
	demo1Chart, demo2Chart, demo3Chart, env1Chart, env2Chart;
	
	//public variables
	//private functions
	/*
	resets the data arrays so that old data never shows in new counties
	called by this snapshot's xmlParser
	*/
	function initVars() {
		demo1Data = [],
		demo2Data = [],
		demo3Data = [],
		infraData = [],
		env1Data = [],
		env2Data = [],
		displayVals = new Object;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function pieChartOptions() {
		var options = {
			chart: {
				plotBackgroundColor: null,
				plotBorderWidth: null,
				plotShadow: false
			 },
			 plotOptions: {
				 pie: {
					enableMouseTracking: false,
					dataLabels: {
						color: '#fff',
						distance: -27,
						formatter: function() {
							//I couldn't figure out a way to use a different number for display, so I am just adding commas on the fly
							var fullNum = '' + this.y;
							fullNum = fullNum.replace(/(\d)(?=(\d\d\d)+(?!\d))/g, "$1,");
							return fullNum + '<br>' + Math.round(this.percentage) + '%';
						}
					},
					shadow: false,
					showInLegend: true,
					size: '100%'
				 }
			 },
			title: {
				text: null
			},
			legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		};
		return options;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function infraChartOptions() {
		var options = {
			 chart: {
				renderTo: 'infra',
				defaultSeriesType: 'column'
			 },
			 plotOptions: {
				column: {
					enableMouseTracking: false,
					borderWidth: 0,
					shadow: false,
					stacking: 'normal'
				}
			 },
			 colors: [
				'#6699CC',
				'#003366'
			 ],
			 xAxis: {
				categories: ['Schools','Police Stations','Fire Stations','Emergency Centers','Medical Facilites','Communication Towers'],
				labels: {
					staggerLines: 2,
					style: {
						fontSize: '10px',
						lineHeight: '10px',
						width: '90px'
					}
				},
				lineWidth: 0
			 },
			 yAxis: {
				alternateGridColor: '#EAF2F5',
				gridLineWidth: 0,
				title: {
					text: null,
					margin: 0
				},
				tickInterval: snapshot.findRange([infraData[0], infraData[1]])
			 },
			 series: [{
				name: 'Inside FEMA Floodplain',
				data: infraData[1]
			 }, {
				name: 'Outside FEMA Floodplain',
				data: infraData[0]
			 }],
			title: {
				text: null
			},
			legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		  };
		  return options;
	}
	
	/*
	sets the dynamic content in the text, and creates the charts
	called by this snapshot's xmlParser
	*/
	function buildCharts() {
		for(key in displayVals) {
			$('span.' + key).each(function() {
				$(this).empty().html(displayVals[key]);
			});
		}
		
		snapshot.screenProcess('show');

		demo1Options = pieChartOptions();
		demo1Options.chart.renderTo = 'demo1';
		demo1Options.series = [{type: 'pie', data: demo1Data}];
		demo1Options.colors = ['#003366',	'#6699CC'];
		demo1Options.chart.events = { click: function(event) { snapshot.openModal(demo1Options); } }
		demo1Chart = new Highcharts.Chart(demo1Options);
		
		demo2Options = pieChartOptions();
		demo2Options.chart.renderTo = 'demo2';
		demo2Options.series = [{type: 'pie', data: demo2Data}];
		demo2Options.colors = ['#003366',	'#6699CC'];
		demo2Options.chart.events = { click: function(event) { snapshot.openModal(demo2Options); } }
		demo2Chart = new Highcharts.Chart(demo2Options);
		
		demo3Options = pieChartOptions();
		demo3Options.chart.renderTo = 'demo3';
		demo3Options.series = [{type: 'pie', data: demo3Data}];
		demo3Options.colors = ['#003366',	'#6699CC'];
		demo3Options.chart.events = { click: function(event) { snapshot.openModal(demo3Options); } }
		demo3Chart = new Highcharts.Chart(demo3Options);
		
		infraOptions = infraChartOptions();
		infraOptions.chart.events = { click: function(event) { snapshot.openModal(infraOptions); } }
		infraChart = new Highcharts.Chart(infraOptions);
		
		hasAcres = parseFloat(displayVals['Acres_Converted']);
		if (hasAcres === -1) {
			$('#env1').html('<p class="nochange">No Data Available</p>').css('background-image', 'url(_/img/nochange.png)').css('cursor', 'default');
			$('#env2').html('<p class="nochange">No Data Available</p>').css('background-image', 'url(_/img/nochange.png)').css('cursor', 'default');
			$('.envChart .legendBlock').parent().css('visibility', 'hidden');
		} else if (hasAcres === 0) {
			$('#env1').html('<p class="nochange">No Change Detected</p>').css('background-image', 'url(_/img/nochange.png)').css('cursor', 'default');
			$('#env2').html('<p class="nochange">No Change Detected</p>').css('background-image', 'url(_/img/nochange.png)').css('cursor', 'default');
			$('.envChart .legendBlock').parent().css('visibility', 'hidden');
		} else {
			$('#env1').empty().css('background-image', 'none').css('cursor', 'pointer');
			$('#env2').empty().css('background-image', 'none').css('cursor', 'pointer');
			$('.envChart .legendBlock').parent().css('visibility', 'visible');
		  
			env1Options = pieChartOptions();
			env1Options.chart.renderTo = 'env1';
			env1Options.series =  [{type: 'pie', data: env1Data}];
			env1Options.colors = ['#003366',	'#6699CC'];
			env1Options.chart.events = { click: function(event) { snapshot.openModal(env1Options); } }
			env1Chart = new Highcharts.Chart(env1Options);
			
			env2Options = pieChartOptions();
			env2Options.chart.renderTo = 'env2';
			env2Options.series =  [{type: 'pie', data: env2Data}];
			env2Options.colors = ['#9EC54E',	'#4C662E'];
			env2Options.chart.events = { click: function(event) { snapshot.openModal(env2Options); } }
			env2Chart = new Highcharts.Chart(env2Options);
		
		}
	};
	
	//public functions
	/*
	creates the specific snapshot map and sets up the query - currently not zoomed in to any specific geography
	called by snapshot.startLoad
	*/
	my.createMap = function() {
		snapshot.queryTask = new esri.tasks.QueryTask(snapshot.mapService + '/Snapshot/Flood_BacksideMap/MapServer/7');
		if(floodMap)
			dijit.byId('floodmap_infowindow').destroy();
		floodMap = new esri.Map("floodmap",{ slider: false, logo: false });
		dojo.connect(floodMap, "onLoad", function() {
			floodMap.disableMapNavigation();
		});
		snapshot.query = new esri.tasks.Query();
		snapshot.query.returnGeometry = true;
		snapshot.query.outFields = ['FIPS'];
	};
	
	/*
	zooms the map to the correct geography, and turns off the mask (if necessary)
	called by snapshot.execute
	*/
	my.showResults = function(results) {
		var extent = esri.graphicsExtent(results.features);
		extent = extent.expand(1.4);
		floodMap.setExtent(extent);
		
		var FIPS = results.features[0].attributes.FIPS;
		var layerDefs = [];
		layerDefs[6] = 'STCOFIPS = ' + FIPS;
		layerDefs[7] = 'FIPS = ' + FIPS;
		imageParameters = new esri.layers.ImageParameters();
		imageParameters.layerDefinitions = layerDefs;
		
		floodLayer = new esri.layers.ArcGISDynamicMapServiceLayer(snapshot.mapService + '/Snapshot/Flood_BacksideMap/MapServer', {'imageParameters':imageParameters});
		floodMap.addLayer(floodLayer);
	};
	
	/*
	takes the xml data for the snapshot and parses it in to an object. We then drop some of that data in to arrays for the charts
	called by snapshot.getData
	*/
	my.xmlParser = function(xml) {
		initVars();
		$(xml).find('FloodData').each(function() {
			var displayArr = $(this)[0].attributes;
			for (i=0; i<displayArr.length; i++) {
				displayVals[displayArr[i].nodeName] = displayArr[i].nodeValue;
			}
		});
		
		snapshot.setNames('Flood Exposure', displayVals['County_Name'], displayVals['State_Name']);
		
		demo1Data.push(["Outside FEMA Floodplain", parseFloat(displayVals['Out_FP_Pop'])]);
		demo1Data.push(["Inside FEMA Floodplain", parseFloat(displayVals['In_FP_Pop'])]);
		
		demo2Data.push(["Outside FEMA Floodplain", parseFloat(displayVals['Out_FP_Over65'])]);
		demo2Data.push(["Inside FEMA Floodplain", parseFloat(displayVals['In_FP_Over65'])]);
		
		demo3Data.push(["Outside FEMA Floodplain", parseFloat(displayVals['Out_FP_Poverty'])]);
		demo3Data.push(["Inside FEMA Floodplain", parseFloat(displayVals['In_FP_Poverty'])]);

		infraData.push([parseFloat(displayVals['SCHOOL_OUT']),parseFloat(displayVals['POLICE_OUT']),parseFloat(displayVals['FIRE_OUT']),parseFloat(displayVals['EOC_OUT']),parseFloat(displayVals['MEDICAL_OUT']),parseFloat(displayVals['COMMUNICATION_OUT'])]);
		infraData.push([parseFloat(displayVals['SCHOOL_IN']),parseFloat(displayVals['POLICE_IN']),parseFloat(displayVals['FIRE_IN']),parseFloat(displayVals['EOC_IN']),parseFloat(displayVals['MEDICAL_IN']),parseFloat(displayVals['COMMUNICATION_IN'])]);
		
		env1Data.push(["Outside FEMA Floodplain", parseFloat(displayVals['Out_FP_Acres_Converted'])]);
		env1Data.push(["Inside FEMA Floodplain", parseFloat(displayVals['In_FP_Acres_Converted'])]);
		
		env2Data.push(["Agricultural Area", parseFloat(displayVals['Acres_Ag2Dev'])]);
		env2Data.push(["Natural Area", parseFloat(displayVals['Acres_Nat2Dev'])]);
		
		buildCharts();
	};
	//expose public variables and functions
	return my;
}());


//variables and functions specific to the ocean jobs snapshot
snapshot.ocean = (function() {
	var my = {};
	//private variables
	var oceanMap, oceanlayer, years,
	sector1Data, sector2Data, sector3Data, sector1Total, sector2Total, sectorDisplay,
	trends1Data, trends2Data, wages1Data, wagesLabels, displayNumSector, displayNumTrends, displayVals,
	sector1Options, sector2Options, sector3Options, trends1Options, trends2Options, wages1Options,
	sector1Chart, sector2Chart, sector3Chart, trends1Chart, trends2Chart, wages1Chart,
	colors = [
		['Living Resources', 'Marine Construction', 'Marine Transportation', 'Offshore Mineral Extraction', 'Ship and Boat Building', 'Tourism and Recreation', 'Suppressed'],
		['#67B8E0', '#FF9E5F', '#B94B3E', '#FDE260', '#CDEA64', '#6969B4', '#cccccc'],
		['living', 'construction', 'transport', 'mineral', 'ship', 'tourism', 'suppress']
	],
	oddFlag = true, allSupressed = true;
	
	//public variables
	//private functions
	/*
	resets the data arrays so that old data never shows in new counties
	called by this snapshot's xmlParser
	*/
	function initVars() {
		years = [],
		sector1Data = [],
		sector2Data = [],
		sector3Data = [],
		sector1Total = 0,
		sector2Total = 0,
		sectorDisplay = [],
		trends1Data = [],
		trends2Data = [],
		wages1Data = [],
		wagesLabels = [],
		displayNumSector = new Object,
		displayNumTrends = new Object,
		displayVals = new Object;
		oddFlag = true;
		allSupressed = true;
	};
	
	/*
	finds the percent or absolute change between an array of numbers. used to generate data for line charts.
	called within this snapshot's xmlParser
	*/
	function findChange(type, theArray) {
		var fullArray = [];
		var firstNum = 0;
		var k = 0;
		while ((firstNum === 0) || (firstNum === null)) {
			firstNum = theArray[k];
			k++;
		}
		k--;
		for (var i = 0; i < years.length; i++) {
			var num;
			if(k > i || theArray[i] === null) {
				num = null;
			} else {
				if(type == 'percent') {
					num = ((theArray[i]/theArray[k])-1)*100;
				} else {
					num = theArray[i]-theArray[0];
				}
			}
			if (isNaN(num)) {
				num = null;
			}
			fullArray.push(num);
		}
		return fullArray;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function sectorChartSetup() {
		var options = {
			chart: {
				plotBackgroundColor: null,
				plotBorderWidth: null,
				plotShadow: false
			},
			plotOptions: {
				pie: {
					enableMouseTracking: false,
					dataLabels: {
						distance: 13,
						formatter: function() {
							if( this.y > 0 ) {
								return this.y + '%';
							} else {
								return null;
							}
						}
					}, 
					size: '70%',
					borderWidth: 0,
            		shadow: false,
					showInLegend: true
				}
			},
			colors: colors[1],
			title: {
				text: null
			},
			legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		};
		return options;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function trendsChartSetup () {
		var options = {
			chart: {
				defaultSeriesType: 'line',
				borderColor: '#ffffff'
			},
			plotOptions: {
				line: {
					enableMouseTracking: false,
					marker: {
						symbol: 'circle'
					},
					shadow: false
				}
			},
			colors: colors[1],
			xAxis: {
				labels: {
					style: {
						fontSize: '10px'
					}
				},
				lineWidth: 0
			},
			yAxis: {
				alternateGridColor: '#EAF2F5',
				gridLineWidth: 0,
				title: {
					text: null,
					margin: 0
				}
			},
			title: {
				text: null
			},
			legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		};
		return options;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function wagesChartSetup () {
		var options = {
			chart: {
				renderTo: 'wages1',
				defaultSeriesType: 'column',
				marginBottom: 70,
				spacingBottom: 15
			 },
			 plotOptions: {
				column: {
					enableMouseTracking: false,
					borderWidth: 0,
					groupPadding: 0.1,
					pointPadding: 0,
					shadow: false
				}
			 },
			 colors: [
				'#003366',
				'#6699CC' 
			 ],
			 xAxis: {
				categories: wages1Data[2],
				labels: {
					staggerLines: 3,
					/*formatter:function() {
						oddFlag = !oddFlag;
						returnString = '';
						if(oddFlag) {
							returnString = this.value;
						} else {
							returnString = this.value;
						}
						//return (oddFlag ? '<br>' : '') + this.value;
						return returnString;
					},*/
					style: {
						fontSize: '10px'
					}
				},
				lineWidth: 0
			 },
			 yAxis: {
				alternateGridColor: '#EAF2F5',
				gridLineWidth: 0,
				title: {
					text: null,
					margin: 0
				}
			 },
			 series: [{
				name: 'County',
				data: wages1Data[0]
			 }, {
				name: 'Nation',
				data: wages1Data[1]
			 }],
			 title: {
				text: null
			},
			 legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		};
		return options;
	};
	
	/*
	sets the dynamic content in the text, and creates the charts
	called by this snapshot's xmlParser
	*/
	function buildCharts() {
		for(key in displayVals) {
			
			$('span.' + key).each(function() {
				$(this).empty().html(displayVals[key]);
			});
		}
		
		for(key in displayNumSector) {
			var whichSector = $.inArray(key, colors[0]);
			$('span.' + colors[2][whichSector] + 'Sector').each(function() {
				$(this).html(displayNumSector[key]);
			});
			$('span.' + colors[2][whichSector] + 'Trends').each(function() {
				$(this).html(displayNumTrends[key]);
			});
		}
		
		snapshot.screenProcess('show');
		
		sector1Options = sectorChartSetup();
		sector1Options.chart.renderTo = 'sector1';
		sector1Options.series = [{type: 'pie', data: sector1Data}];
		sector1Options.chart.events = { click: function(event) { snapshot.openModal(sector1Options); } }
		sector1Chart = new Highcharts.Chart(sector1Options);
		
		sector2Options = sectorChartSetup();
		sector2Options.chart.renderTo = 'sector2';
		sector2Options.series = [{type: 'pie', data: sector2Data}];
		sector2Options.chart.events = { click: function(event) { snapshot.openModal(sector2Options); } }
		sector2Chart = new Highcharts.Chart(sector2Options);
		
		sector3Options = sectorChartSetup();
		sector3Options.chart.renderTo = 'sector3';
		sector3Options.series = [{type: 'pie', data: sector3Data}];
		sector3Options.chart.events = { click: function(event) { snapshot.openModal(sector3Options); } }
		sector3Chart = new Highcharts.Chart(sector3Options);
		
		trends1Options = trendsChartSetup();
		trends1Options.chart.renderTo = 'trends1';
		trends1Options.xAxis.categories = years;
		if ( !allSupressed ) {
			trends1Options.yAxis.tickInterval = snapshot.findRange([trends1Data[0].data, trends1Data[1].data, trends1Data[2].data, trends1Data[3].data, trends1Data[4].data, trends1Data[5].data]);
		} else {
			trends1Options.colors = [colors[1][6]];
		}
		trends1Options.series = trends1Data;
		trends1Options.chart.events = { click: function(event) { snapshot.openModal(trends1Options); } }
		trends1Chart = new Highcharts.Chart(trends1Options);
		
		trends2Options = trendsChartSetup();
		trends2Options.chart.renderTo = 'trends2';
		trends2Options.xAxis.categories = years;
		if ( !allSupressed ) {
			trends2Options.yAxis.tickInterval = snapshot.findRange([trends2Data[0].data, trends2Data[1].data, trends2Data[2].data, trends2Data[3].data, trends2Data[4].data, trends2Data[5].data]);
		}
		 else {
			trends2Options.colors = [colors[1][6]];
		}
		trends2Options.series = trends2Data;
		trends2Options.chart.events = { click: function(event) { snapshot.openModal(trends2Options); } }
		trends2Chart = new Highcharts.Chart(trends2Options);
		
		wages1Options = wagesChartSetup();
		wages1Options.chart.events = { click: function(event) { snapshot.openModal(wages1Options); } }
		wages1Chart = new Highcharts.Chart(wages1Options);
	};
	
	//public functions
	/*
	creates the specific snapshot map and sets up the query - currently not zoomed in to any specific geography
	called by snapshot.startLoad
	*/
	my.createMap = function() {
		snapshot.queryTask = new esri.tasks.QueryTask(snapshot.mapService + '/Snapshot/OceanJobs_BacksideMap/MapServer/2');
		if(oceanMap)
			dijit.byId('oceanmap_infowindow').destroy();
		oceanMap = new esri.Map("oceanmap", { slider: false, logo: false });
		dojo.connect(oceanMap, "onLoad", function() {
			oceanMap.disableMapNavigation();
		}); 
		oceanlayer = new esri.layers.ArcGISDynamicMapServiceLayer(snapshot.mapService + '/Snapshot/OceanJobs_BacksideMap/MapServer');
		oceanMap.addLayer(oceanlayer);
		snapshot.query = new esri.tasks.Query();
		snapshot.query.returnGeometry = true;
	};
	
	/*
	zooms the map to the correct geography, and turns off the mask (if necessary)
	called by snapshot.execute
	*/
	my.showResults = function(results) {
		var extent = esri.graphicsExtent(results.features);
		extent = extent.expand(2.4);
		oceanMap.setExtent(extent);
	};
	
	/*
	takes the xml data for the snapshot and parses it in to an object. We then drop some of that data in to arrays for the charts
	called by snapshot.getData
	*/
	my.xmlParser = function(xml) {
		initVars();
		$(xml).find('CountyData').each(function() {
			var displayArr = $(this)[0].attributes;
			for (i=0; i<displayArr.length; i++) {
				displayVals[displayArr[i].nodeName] = displayArr[i].nodeValue;
			}
			var firstYear = parseInt(displayVals.MinAnalysisYear);
			var lastYear = parseInt(displayVals.AnalysisYear);
			for (i=firstYear; i<=lastYear; i++) {
				years.push(i);
			}
		});
		
		snapshot.setNames('Ocean Jobs', displayVals['County_Name'], displayVals['State_Name']);
		
		$(xml).find('JobsPercentages SectorJobs').each(function(index) {
			sector1Data.push([colors[0][index], parseFloat($(this).attr('PercentEmployment'))]);
			sector1Total += parseFloat($(this).attr('PercentEmployment'));
			displayNumSector[$(this).attr('OceanSector')] = $(this).attr('PercentEmployment_Display');
		});
		
		if (sector1Total < 100) {
			sector1Data.push([colors[0][6], Math.round((100-sector1Total)*100)/100]);
			displayNumSector['suppress'] = Math.round((100-sector1Total)*100)/100 + '%';
			displayVals['suppressSector'] = Math.round((100-sector1Total)*100)/100 + '%';
		} else {
			displayVals['suppressSector'] = 'NA';
		}
		
		$(xml).find('JobsPercentagesForState SectorJobs').each(function(index) {
			sector2Data.push([colors[0][index], parseFloat($(this).attr('PercentEmployment'))]);
			sector2Total += parseFloat($(this).attr('PercentEmployment'));
		});
		
		if (sector2Total < 100)
			sector2Data.push([colors[0][6], Math.round((100-sector2Total)*100)/100]);
		
		$(xml).find('JobsPercentagesForNation SectorJobs').each(function(index) {
			sector3Data.push([colors[0][index], parseFloat($(this).attr('PercentEmployment'))]);
		});
		
		for(i=0; i<colors[0].length; i++) {
			var localArr = [];
			$(xml).find('JobsDecade Jobs[OceanSector="' + colors[0][i] + '"]').each(function() {
				var val = $(this).attr('Employment');
				if (val === '-9999') {
					val = null;
				} else {
					val = parseFloat(val);
				}

				if ( (val !== 0) && (val !== null) )
					allSupressed = false;	

				localArr.push(val);
			});
			trends1Data.push({name: colors[0][i], data: findChange('percent', localArr)});
			trends2Data.push({name: colors[0][i], data: findChange('absolute', localArr)});
		}
		if ( allSupressed ) {
			trends1Data = [];
			trends2Data = [];
			trends1Data.push({name: colors[0][6], data: [0,0,0,0,0]});
			trends2Data.push({name: colors[0][6], data: [0,0,0,0,0]});
		}
		
		$(xml).find('SectorJobsPercentIncrease_Display SectorJobs').each(function(index) {
			displayNumTrends[$(this).attr('OceanSector')] = $(this).attr('JobsPercentIncrease');
		});
		
		var wagesCounty = [];
		var wagesNation = [];
		$(xml).find('SectorAnnualWages SectorWages').each(function(index) {
			var myVal = parseFloat($(this).attr('AnnualWages'))
			if(isNaN(myVal)) {
				wagesCounty.push(null);
			} else {
				wagesCounty.push(myVal);
			}
			wagesLabels.push($(this).attr('OceanSector'));
		});
		$(xml).find('SectorAnnualWagesForNation SectorWages').each(function(index) {
			var myVal = parseFloat($(this).attr('AnnualWages'))
			if(isNaN(myVal)) {
				wagesNation.push(null);
			} else {
				wagesNation.push(myVal);
			}
		});
		
		wages1Data.push(wagesCounty);
		wages1Data.push(wagesNation);
		wages1Data.push(wagesLabels);
		
		buildCharts();
	};
	//expose public variables and functions
	return my;
}());

//variables and functions specific to the wetlands snapshot
snapshot.wetlands = (function() {
	var my = {};
	//private variables
	var wetlandsMap, wetlandsLayer, imageParameters,
	safer2Data, safer2Options, safer2Chart;
	var gsvc = new esri.tasks.GeometryService('http://www.csc.noaa.gov/arcgis/rest/services/Geometry/GeometryServer');
	
	//public variables
	my.mapExtent = [];
	//private functions
	/*
	resets the data arrays so that old data never shows in new counties
	called by this snapshot's xmlParser
	*/
	function initVars() {
		//safer1Data = [],
		safer2Data = [],
		displayVals = new Object;
	};
	
	/*
	sets default options for this snapshot's charts
	called by this snapshot's buildCharts
	*/
	function pieChartOptions() {
		var options = {
			chart: {
				plotBackgroundColor: null,
				backgroundColor:'rgba(0,0,0,0)',
				plotBorderWidth: null,
				plotShadow: false
			},
			plotOptions: {
				pie: {
					enableMouseTracking: false,
					dataLabels: {
						distance: 13,
						formatter: function() {
							return this.y + '%';
						}
					}, 
					size: '70%',
            		shadow: false,
					showInLegend: true,
					slicedOffset: 5
				}
			},
			title: {
				text: null
			},
			legend: {
				enabled: false
			},
			exporting: {
				enabled: false
			}
		};
		return options;
	};
	
	/*
	sets the dynamic content in the text, and creates the charts
	called by this snapshot's xmlParser
	*/
	function buildCharts() {
		for(key in displayVals) {
			$('span.' + key).each(function() {
				$(this).empty().html(displayVals[key]);
			});
		}
		if(displayVals['GDP_County'] === 'unavailable*') {
			$('.productiveChart p.mapLegend').show();
		} else {
			$('.productiveChart p.mapLegend').hide();
		}
		
		snapshot.screenProcess('show');

		safer2Options = pieChartOptions();
		safer2Options.chart.renderTo = 'safer2';
		safer2Options.series = [{type: 'pie', data: safer2Data}];
		safer2Options.chart.events = { click: function(event) { snapshot.openModal(safer2Options); } }
		safer2Chart = new Highcharts.Chart(safer2Options);
	};
	
	//public functions
	/*
	creates the specific snapshot map and sets up the query - currently not zoomed in to any specific geography
	called by snapshot.startLoad
	*/
	my.createMap = function() {
		snapshot.queryTask = new esri.tasks.QueryTask(snapshot.mapService + '/Snapshot/Wetlands_Snapshot_Data/MapServer/1');
		if(wetlandsMap)
			dijit.byId('wetlandsmap_infowindow').destroy();
		wetlandsMap = new esri.Map("wetlandsmap",{ slider: false, logo: false });
		dojo.connect(wetlandsMap, "onLoad", function() {
			wetlandsMap.disableMapNavigation();
		});
		snapshot.query = new esri.tasks.Query();
		snapshot.query.returnGeometry = true;
		snapshot.query.outFields = ['FIPS'];
	};
	
	/*
	zooms the map to the correct geography, and turns off the mask (if necessary)
	called by snapshot.execute
	*/
	my.showResults = function(results) {
		var extent = esri.graphicsExtent(results.features);
		extent = extent.expand(1.1);
		wetlandsMap.setExtent(extent);
		
		var FIPS = results.features[0].attributes.FIPS;
		var layerDefs = [];
		layerDefs[2] = 'FIPSSTCO != ' + FIPS;
		layerDefs[1] = 'FIPS != ' + FIPS;
		imageParameters = new esri.layers.ImageParameters();
		imageParameters.layerDefinitions = layerDefs;
		
		wetlandsLayer = new esri.layers.ArcGISDynamicMapServiceLayer(snapshot.mapService + '/Snapshot/Wetlands_Snapshot_Data/MapServer', {'imageParameters':imageParameters});
		wetlandsMap.addLayer(wetlandsLayer);

		
		//this bit is if we need to throw coordinates to arcgis.com
		var outSR = new esri.SpatialReference({ wkid: 4326});
		gsvc.project([ extent ], outSR, function(features) {
			my.mapExtent = features[0];
		});
	};
	
	/*
	takes the xml data for the snapshot and parses it in to an object. We then drop some of that data in to arrays for the charts
	called by snapshot.getData
	*/
	my.xmlParser = function(xml) {
		initVars();
		$(xml).find('CountyData').each(function() {
			var displayArr = $(this)[0].attributes;
			for (i=0; i<displayArr.length; i++) {
				displayVals[displayArr[i].nodeName] = displayArr[i].nodeValue;
			}
		});
		$(xml).find('CountyData').children().children().each(function() {
			var displayArr = $(this)[0].attributes;
			for (i=0; i<displayArr.length; i++) {
				displayVals[displayArr[i].nodeName] = displayArr[i].nodeValue;
			}
		});

		snapshot.setNames('Wetland Benefits', displayVals['County_Name'], displayVals['State_Name']);

		if(displayVals['WetlandsPercentTotal'] !== '0')
			safer2Data.push({ name: "Wetlands", y: parseFloat(displayVals['WetlandsPercentTotal']), color:'#6FA359', sliced: true, selected: true });
		if(displayVals['DevelopedPercentTotal'] !== '0')
			safer2Data.push({ name: "Developed", y: parseFloat(displayVals['DevelopedPercentTotal']), color:'#9732CC', sliced: false, selected: false });
		if(displayVals['AgriculturePercentTotal'] !== '0')
			safer2Data.push({ name: "Agriculture", y: parseFloat(displayVals['AgriculturePercentTotal']), color:'#EFAE50', sliced: false, selected: false });
		if(displayVals['OtherPercentTotal'] !== '0')
			safer2Data.push({ name: "Other (grasslands, forests,<br>scrub vegetation, and<br>barren land)", y: parseFloat(displayVals['OtherPercentTotal']), color:'#dddddd', sliced: false, selected: false });
		
		buildCharts();
	};
	//expose public variables and functions
	return my;
}());

dojo.ready(function(){
	$(document).ready(function() { 
		//start loading 
		snapshot.init();
		$.history.init(snapshot.loadContent);
		//$.address.init(snapshot.loadContent);
		
		//set up our event listeners
		$('.toolbar a').click(function() {
			var pane = $(this).attr('href');
			if((snapshot.newSnapshot !== null || snapshot.currentSnapshot !== null) || pane !== '#pane2') {
				$('.panes div[id]').addClass('hide');
				$(pane).removeClass('hide');
				$('.toolbar a').removeClass('active');
				$(this).addClass('active');
				if($('.panes').height() === 0) {
					$('.panes').paneOpen();
					$('.close').slideDown();
				}
			} else {
				$.modal('<p><strong>Select a Snapshot First</strong></p><p>In order to ensure that we have data avaiable for your county, please select a Snapshot first.</p>', { containerId : 'selectFirst', position: ['48px'] } );
			}
			return false;
		})
		$('.close').click(function() {
			$(this).slideUp(function() {
				$('#welcome').slideUp();
				$(this).css('float', 'none');
			});
			$('.panes').paneClose();
		});
		$('#pane1 button').click(function() {
			snapshot.getSnapshot($(this).attr('name'));
			return false;
		});
		$('#stateList').change(function() {
			snapshot.createCountyList($(this).val());
			if(snapshot.selectMapReady) {
				snapshot.changeState($(this).val());
			}
		});
		$('#countyList').change(function() {
			var fips = $('#stateList').val() + $(this).val();
			if(snapshot.selectMapReady) {
				snapshot.changeCounty($(this).val());
			}
			snapshot.getFIPS(fips);
		});
		$('.download').click(function() {
			snapshot.printPDF();
		});
		$('.reset').click(function(e) {
            window.open('/snapshots/', '_self');
        });
		$('.largerMap a').live('click', function() {
			window.open($(this).attr('href') + '&extent=' + snapshot.wetlands.mapExtent.xmin + ',' + snapshot.wetlands.mapExtent.ymin + ',' + snapshot.wetlands.mapExtent.xmax + ',' + snapshot.wetlands.mapExtent.ymax);
			return false;
		});
		
		$('#floodRef').live('click', function(e) {
			e.preventDefault();
			snapshot.getSnapshot('flood');
			return false;
		});
		$('#oceanRef').live('click', function(e) {
			e.preventDefault();
			if (snapshot.currentFIPS === '22005' || snapshot.currentFIPS === '22007' || snapshot.currentFIPS === '22033' || snapshot.currentFIPS === '22053' || snapshot.currentFIPS === '24027' || snapshot.currentFIPS === '37103' || snapshot.currentFIPS === '37147') {
				alert('The Ocean Jobs Snapshot is not available for this county at this time.')
			} else {
				snapshot.getSnapshot('ocean');
			}
			return false;
		});
		
		//start doing business
		if(snapshot.currentFIPS === null) {
			$('.toolbar a[href="#pane1"]').click();
		} else {
			$('.close').slideDown();
		}
	});
});