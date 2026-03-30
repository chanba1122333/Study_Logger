export namespace main {
	
	export class StudyLog {
	    name: string;
	    seconds: number;
	
	    static createFrom(source: any = {}) {
	        return new StudyLog(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.seconds = source["seconds"];
	    }
	}

}

